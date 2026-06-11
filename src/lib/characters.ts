import "server-only";

import { readFile } from "node:fs/promises";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { DRUID_ASI_LEVELS, DRUID_CANTRIP_LEVELS, DRUID_SPELL_SLOTS } from "@/lib/constants";
import { getCatalogEntry, listCatalogEntries } from "@/lib/catalog";
import { database } from "@/lib/db";
import { parseJson, stringifyJson } from "@/lib/json";
import { getLanguageOptions, getSkillOptions } from "@/lib/rules";
import {
  characterLevels,
  characters,
  characterSelections,
  currentSummons,
  inventoryItems,
  preparedSpells,
  sourcePages,
  wildShapeKnownSeen,
} from "@/lib/schema";
import type {
  Ability,
  AbilityScores,
  BackgroundData,
  CatalogEntry,
  BeastData,
  CharacterRecord,
  CharacterSelectionPayload,
  CharacterSelectionRecord,
  CharacterSettings,
  CharacterSheet,
  ChoiceDefinition,
  ClassData,
  CreatureData,
  CurrentSummon,
  CurrentSummonRecord,
  EquipmentData,
  FeatData,
  Grant,
  LineageData,
  PendingChoice,
  SpellData,
  SubclassData,
} from "@/lib/types";
import {
  createId,
  modifierForScore,
  nowIso,
  normalizeWhitespace,
  proficiencyBonusForLevel,
  uniqueStrings,
} from "@/lib/utils";

function validateLevel(level: number) {
  return Math.max(1, Math.min(20, level));
}

const DEFAULT_SETTINGS: CharacterSettings = {
  featsEnabled: true,
  tashaOptionalDruidFeatures: false,
};

type CreateCharacterInput = {
  name: string;
  abilityScores: AbilityScores;
  lineageSlug?: string | null;
  lineageVariantSlug?: string | null;
  backgroundSlug?: string | null;
  settings?: Partial<CharacterSettings>;
};

type CharacterBundle = {
  character: CharacterRecord;
  selections: CharacterSelectionRecord[];
  preparedSpellSlugs: string[];
  wildShapeStatus: Record<string, { seen: boolean; known: boolean }>;
};

type SourceTextPanel = {
  title: string;
  sourcebook: string;
  sourceUrl: string;
  text: string;
};

function parseCurrentSummonRow(row: typeof currentSummons.$inferSelect): CurrentSummonRecord {
  return {
    id: row.id,
    characterId: row.characterId,
    creatureSlug: row.creatureSlug,
    nickname: row.nickname,
    currentHitPoints: row.currentHitPoints,
    maxHitPoints: row.maxHitPoints,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCharacterRow(row: typeof characters.$inferSelect): CharacterRecord {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    classSlug: row.classSlug,
    subclassSlug: row.subclassSlug,
    lineageSlug: row.lineageSlug,
    lineageVariantSlug: row.lineageVariantSlug,
    backgroundSlug: row.backgroundSlug,
    abilityScores: parseJson<AbilityScores>(row.abilityScores),
    settings: parseJson<CharacterSettings>(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseSelectionRow(row: typeof characterSelections.$inferSelect): CharacterSelectionRecord {
  return {
    id: row.id,
    characterId: row.characterId,
    key: row.selectionKey,
    level: row.level,
    kind: row.kind,
    payload: parseJson<CharacterSelectionPayload>(row.payload),
  };
}

function selectionMap(selections: CharacterSelectionRecord[]) {
  return new Map(selections.map((selection) => [selection.key, selection.payload]));
}

function mergeAbilityScores(
  base: AbilityScores,
  additions: Array<Partial<Record<Ability, number>> | undefined>,
) {
  const next = { ...base };
  for (const addition of additions) {
    if (!addition) {
      continue;
    }
    for (const [ability, amount] of Object.entries(addition) as [Ability, number][]) {
      next[ability] += amount;
    }
  }
  return next;
}

function hasValuesPayload(
  payload: CharacterSelectionPayload,
): payload is { values: string[] } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "values" in payload &&
    Array.isArray((payload as { values?: unknown }).values)
  );
}

function hasValuePayload(payload: CharacterSelectionPayload): payload is { value: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "value" in payload &&
    typeof (payload as { value?: unknown }).value === "string"
  );
}

function hasIncreasesPayload(
  payload: CharacterSelectionPayload,
): payload is { increases: Partial<Record<Ability, number>> } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "increases" in payload &&
    typeof (payload as { increases?: unknown }).increases === "object"
  );
}

function grantsFromResolvedChoice(choice: ChoiceDefinition, payload: CharacterSelectionPayload): Grant[] {
  const domain = choice.metadata?.domain;

  if (hasValuesPayload(payload)) {
    if (domain === "language") {
      return payload.values.map((value) => ({
        type: "proficiency" as const,
        category: "language" as const,
        value,
      }));
    }
    if (domain === "skill") {
      return payload.values.map((value) => ({
        type: "proficiency" as const,
        category: "skill" as const,
        value,
      }));
    }
  }

  if (hasValuePayload(payload)) {
    if (domain === "language") {
      return [
        {
          type: "proficiency",
          category: "language",
          value: payload.value,
        },
      ];
    }
    if (domain === "skill") {
      return [
        {
          type: "proficiency",
          category: "skill",
          value: payload.value,
        },
      ];
    }
    if (domain === "spell-list") {
      return [
        {
          type: "spell",
          spellSlug: payload.value,
          mode: "cantrip",
        },
      ];
    }
  }

  return [];
}

function proficiencyValues(
  grants: Grant[],
  category: Extract<Extract<Grant, { type: "proficiency" }>["category"], string>,
) {
  return grants
    .filter(
      (grant): grant is Extract<Grant, { type: "proficiency" }> =>
        grant.type === "proficiency" && grant.category === category,
    )
    .map((grant) => grant.value);
}

function choiceSelectionKey(sourceKind: string, sourceSlug: string, choiceId: string) {
  return `catalog:${sourceKind}:${sourceSlug}:${choiceId}`;
}

function systemSelectionKey(id: string) {
  return `system:${id}`;
}

function featSelectionKey(level: number) {
  return systemSelectionKey(`feat:${level}`);
}

function featModeSelectionKey(level: number) {
  return systemSelectionKey(`feat-mode:${level}`);
}

function asiSelectionKey(level: number) {
  return systemSelectionKey(`asi:${level}`);
}

function cantripSelectionKey(level: number) {
  return systemSelectionKey(`cantrips:${level}`);
}

function classSkillSelectionKey() {
  return systemSelectionKey("class-skills");
}

function lineagesWithChoices(lineage: CatalogEntry<LineageData> | null, variantSlug?: string | null) {
  if (!lineage) {
    return [];
  }

  const variant = lineage.data.variants.find((entry) => entry.slug === variantSlug);
  return [
    ...lineage.data.choices.map((choice) => ({
      sourceKind: "lineage" as const,
      sourceSlug: lineage.slug,
      choice,
    })),
    ...(variant?.choices.map((choice) => ({
      sourceKind: "lineage" as const,
      sourceSlug: lineage.slug,
      choice,
    })) ?? []),
  ];
}

function backgroundChoices(background: CatalogEntry<BackgroundData> | null) {
  if (!background) {
    return [];
  }

  return background.data.choices.map((choice) => ({
    sourceKind: "background" as const,
    sourceSlug: background.slug,
    choice,
  }));
}

async function getCharacterBundle(characterId: string): Promise<CharacterBundle | null> {
  const [row] = await database
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!row) {
    return null;
  }

  const selectionRows = await database
    .select()
    .from(characterSelections)
    .where(eq(characterSelections.characterId, characterId))
    .orderBy(asc(characterSelections.level), asc(characterSelections.selectionKey));

  const preparedRows = await database
    .select()
    .from(preparedSpells)
    .where(eq(preparedSpells.characterId, characterId))
    .orderBy(asc(preparedSpells.spellSlug));

  const wildShapeRows = await database
    .select()
    .from(wildShapeKnownSeen)
    .where(eq(wildShapeKnownSeen.characterId, characterId));

  return {
    character: parseCharacterRow(row),
    selections: selectionRows.map(parseSelectionRow),
    preparedSpellSlugs: preparedRows.map((entry) => entry.spellSlug),
    wildShapeStatus: Object.fromEntries(
      wildShapeRows.map((entry) => [
        entry.beastSlug,
        { seen: entry.seen, known: entry.known },
      ]),
    ),
  };
}

function allGrantedChoices(
  lineage: CatalogEntry<LineageData> | null,
  background: CatalogEntry<BackgroundData> | null,
  feats: CatalogEntry<FeatData>[],
  variantSlug?: string | null,
) {
  return [
    ...lineagesWithChoices(lineage, variantSlug),
    ...backgroundChoices(background),
    ...feats.flatMap((feat) =>
      feat.data.choices.map((choice) => ({
        sourceKind: "feat" as const,
        sourceSlug: feat.slug,
        choice,
      })),
    ),
  ];
}

function dynamicChoiceOptions(choice: ChoiceDefinition, spells: CatalogEntry<SpellData>[]) {
  if (choice.options && choice.options.length > 0) {
    return choice.options;
  }

  const domain = choice.metadata?.domain;

  if (domain === "language") {
    return getLanguageOptions().map((value) => ({ value, label: value }));
  }

  if (domain === "skill") {
    return getSkillOptions().map((value) => ({ value, label: value }));
  }

  if (domain === "spell-list") {
    const spellList = String(choice.metadata?.spellList ?? "");
    const maxLevel = Number(choice.metadata?.maxLevel ?? 0);
    return spells
      .filter(
        (spell) =>
          spell.data.level <= maxLevel &&
          spell.data.spellLists.some((value) => value.toLowerCase() === spellList.toLowerCase()),
      )
      .map((spell) => ({
        value: spell.slug,
        label: spell.name,
        description: `${spell.data.school} cantrip`,
      }));
  }

  return [];
}

function featEligible(
  feat: CatalogEntry<FeatData>,
  context: {
    level: number;
    spellcasting: boolean;
    abilities: AbilityScores;
    lineage?: string | null;
    proficiencies: { armor: string[]; weapons: string[] };
  },
) {
  if (feat.data.prerequisites.length === 0) {
    return true;
  }

  return feat.data.prerequisites.every((prerequisite) => {
    if (prerequisite.type === "spellcasting") {
      return context.spellcasting;
    }
    if (prerequisite.type === "level") {
      return context.level >= prerequisite.minimum;
    }
    if (prerequisite.type === "ability") {
      return context.abilities[prerequisite.ability] >= prerequisite.minimum;
    }
    if (prerequisite.type === "race") {
      return normalizeWhitespace(context.lineage ?? "")
        .toLowerCase()
        .includes(prerequisite.value.toLowerCase());
    }
    if (prerequisite.type === "proficiency") {
      const haystack =
        prerequisite.category === "armor" ? context.proficiencies.armor : context.proficiencies.weapons;
      return haystack.some((value) => value.toLowerCase().includes(prerequisite.value.toLowerCase()));
    }
    return true;
  });
}

function isDruidSpell(spell: CatalogEntry<SpellData>) {
  return spell.data.spellLists.some((value) => value.toLowerCase() === "druid");
}

function estimatedHitPointsForLevel(level: number, hitDie: number, constitutionModifier: number) {
  if (level <= 0) {
    return 0;
  }

  const averagePerLevel = Math.floor(hitDie / 2) + 1;
  return hitDie + constitutionModifier + Math.max(0, level - 1) * (averagePerLevel + constitutionModifier);
}

export async function listCharacters() {
  const rows = await database
    .select()
    .from(characters)
    .orderBy(desc(characters.updatedAt), asc(characters.name));

  return rows.map(parseCharacterRow);
}

export async function createCharacter(input: CreateCharacterInput) {
  const id = createId("char");
  const now = new Date().toISOString();
  const settings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };

  await database.insert(characters).values({
    id,
    name: input.name,
    level: 1,
    classSlug: "druid",
    subclassSlug: "circle-of-the-shepherd",
    lineageSlug: input.lineageSlug ?? null,
    lineageVariantSlug: input.lineageVariantSlug ?? null,
    backgroundSlug: input.backgroundSlug ?? null,
    abilityScores: stringifyJson(input.abilityScores),
    settings: stringifyJson(settings),
    createdAt: now,
    updatedAt: now,
  });

  await database.insert(characterLevels).values({
    id: createId("lvl"),
    characterId: id,
    level: 1,
    createdAt: now,
  });

  return id;
}

export async function setCharacterLevel(characterId: string, nextLevel: number) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    throw new Error("Character not found");
  }

  const level = validateLevel(nextLevel);

  await database
    .update(characters)
    .set({
      level,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(characters.id, characterId));

  const existingLevels = await database
    .select()
    .from(characterLevels)
    .where(eq(characterLevels.characterId, characterId));

  const seenLevels = new Set(existingLevels.map((entry) => entry.level));
  const inserts = [];
  for (let current = 1; current <= level; current += 1) {
    if (!seenLevels.has(current)) {
      inserts.push({
        id: createId("lvl"),
        characterId,
        level: current,
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (inserts.length > 0) {
    await database.insert(characterLevels).values(inserts);
  }
}

export async function updateCharacterProfile(
  characterId: string,
  payload: {
    lineageSlug?: string | null;
    lineageVariantSlug?: string | null;
    backgroundSlug?: string | null;
    settings?: Partial<CharacterSettings>;
  },
) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    throw new Error("Character not found");
  }

  const settings = {
    ...bundle.character.settings,
    ...(payload.settings ?? {}),
  };

  await database
    .update(characters)
    .set({
      lineageSlug:
        payload.lineageSlug === undefined ? bundle.character.lineageSlug : payload.lineageSlug,
      lineageVariantSlug:
        payload.lineageVariantSlug === undefined
          ? bundle.character.lineageVariantSlug
          : payload.lineageVariantSlug,
      backgroundSlug:
        payload.backgroundSlug === undefined
          ? bundle.character.backgroundSlug
          : payload.backgroundSlug,
      settings: stringifyJson(settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(characters.id, characterId));
}

export async function upsertCharacterSelection(params: {
  characterId: string;
  key: string;
  level: number;
  kind: string;
  payload: CharacterSelectionPayload;
}) {
  const existing = await database
    .select()
    .from(characterSelections)
    .where(
      and(
        eq(characterSelections.characterId, params.characterId),
        eq(characterSelections.selectionKey, params.key),
      ),
    )
    .limit(1);

  const row = {
    id: existing[0]?.id ?? createId("sel"),
    characterId: params.characterId,
    selectionKey: params.key,
    level: params.level,
    kind: params.kind,
    payload: stringifyJson(params.payload),
    updatedAt: new Date().toISOString(),
  };

  await database
    .insert(characterSelections)
    .values(row)
    .onConflictDoUpdate({
      target: [characterSelections.id],
      set: {
        selectionKey: row.selectionKey,
        level: row.level,
        kind: row.kind,
        payload: row.payload,
        updatedAt: row.updatedAt,
      },
    });
}

export async function setPreparedSpellSlugs(characterId: string, spellSlugs: string[]) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    throw new Error("Character not found");
  }

  const requestedSlugs = uniqueStrings(spellSlugs);
  const requestedSpells = (
    await Promise.all(
      requestedSlugs.map((spellSlug) => getCatalogEntry<SpellData>("spell", spellSlug)),
    )
  ).filter(Boolean) as CatalogEntry<SpellData>[];

  if (requestedSpells.length !== requestedSlugs.length) {
    throw new Error("One or more selected spells could not be found.");
  }

  if (!requestedSpells.every((spell) => spell.data.level > 0 && isDruidSpell(spell))) {
    throw new Error("Prepared spells must be leveled druid spells.");
  }

  const sheet = await getCharacterSheet(characterId);
  if (!sheet) {
    throw new Error("Character not found");
  }

  if (requestedSlugs.length > sheet.preparedSpellCapacity) {
    throw new Error(`You can only prepare ${sheet.preparedSpellCapacity} spells at this level.`);
  }

  await database.delete(preparedSpells).where(eq(preparedSpells.characterId, characterId));

  if (requestedSlugs.length === 0) {
    return;
  }

  await database.insert(preparedSpells).values(
    requestedSlugs.map((spellSlug) => ({
      id: createId("prep"),
      characterId,
      spellSlug,
      updatedAt: nowIso(),
    })),
  );
}

export async function upsertWildShapeStatus(params: {
  characterId: string;
  beastSlug: string;
  seen: boolean;
  known: boolean;
}) {
  const existing = await database
    .select()
    .from(wildShapeKnownSeen)
    .where(
      and(
        eq(wildShapeKnownSeen.characterId, params.characterId),
        eq(wildShapeKnownSeen.beastSlug, params.beastSlug),
      ),
    )
    .limit(1);

  const row = {
    id: existing[0]?.id ?? createId("wild"),
    characterId: params.characterId,
    beastSlug: params.beastSlug,
    seen: params.seen,
    known: params.known,
  };

  await database
    .insert(wildShapeKnownSeen)
    .values(row)
    .onConflictDoUpdate({
      target: [wildShapeKnownSeen.id],
      set: {
        seen: row.seen,
        known: row.known,
      },
    });
}

function classGrantedFeatures(level: number, classEntry: CatalogEntry<ClassData>) {
  return classEntry.data.features.filter((feature) => feature.level <= level);
}

function accumulatedAsiSelections(selections: CharacterSelectionRecord[]) {
  return selections
    .filter((selection) => selection.kind === "asi")
    .map((selection) => (hasIncreasesPayload(selection.payload) ? selection.payload.increases : undefined));
}

export async function getCharacterSheet(characterId: string) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    return null;
  }

  const character = bundle.character;
  const selections = selectionMap(bundle.selections);
  const classEntry = await getCatalogEntry<ClassData>("class", character.classSlug);
  const subclassEntry = await getCatalogEntry<SubclassData>("subclass", character.subclassSlug);
  const lineageEntry = character.lineageSlug
    ? await getCatalogEntry<LineageData>("lineage", character.lineageSlug)
    : null;
  const backgroundEntry = character.backgroundSlug
    ? await getCatalogEntry<BackgroundData>("background", character.backgroundSlug)
    : null;

  if (!classEntry || !subclassEntry) {
    throw new Error("Required class catalog is missing. Run source sync first.");
  }

  const featSelections = bundle.selections.filter((selection) => selection.kind === "feat");
  const featSlugs = featSelections
    .map((selection) => (hasValuePayload(selection.payload) ? selection.payload.value : undefined))
    .filter((value): value is string => Boolean(value));

  const featEntries = (
    await Promise.all(featSlugs.map((slug) => getCatalogEntry<FeatData>("feat", slug)))
  ).filter(Boolean) as CatalogEntry<FeatData>[];

  const spellEntries = (
    await Promise.all(
      bundle.preparedSpellSlugs.map((slug) => getCatalogEntry<SpellData>("spell", slug)),
    )
  ).filter(Boolean) as CatalogEntry<SpellData>[];

  const lineageVariant = lineageEntry?.data.variants.find(
    (variant) => variant.slug === character.lineageVariantSlug,
  );

  const choiceCatalog = allGrantedChoices(
    lineageEntry,
    backgroundEntry,
    featEntries,
    character.lineageVariantSlug,
  );

  const resolvedChoiceGrants = choiceCatalog.flatMap(({ sourceKind, sourceSlug, choice }) => {
    const payload = selections.get(choiceSelectionKey(sourceKind, sourceSlug, choice.id));
    return payload ? grantsFromResolvedChoice(choice, payload) : [];
  });

  const allGrants: Grant[] = [
    ...(backgroundEntry?.data.grants ?? []),
    ...(lineageEntry?.data.grants ?? []),
    ...(lineageVariant?.grants ?? []),
    ...classGrantedFeatures(character.level, classEntry).flatMap((feature) => feature.grants ?? []),
    ...subclassEntry.data.features
      .filter((feature) => feature.level <= character.level)
      .flatMap((feature) => feature.grants ?? []),
    ...featEntries.flatMap((feat) => feat.data.grants),
    ...resolvedChoiceGrants,
  ];

  const abilityScores = mergeAbilityScores(character.abilityScores, accumulatedAsiSelections(bundle.selections));
  const modifiers = Object.fromEntries(
    Object.entries(abilityScores).map(([ability, score]) => [ability, modifierForScore(score)]),
  ) as AbilityScores;
  const proficiencyBonus = proficiencyBonusForLevel(character.level);

  const classSkillPayload = selections.get(classSkillSelectionKey());
  const selectedClassSkills =
    classSkillPayload && hasValuesPayload(classSkillPayload)
      ? classSkillPayload.values
      : [];

  const selectedCantripSlugs = bundle.selections
    .filter((selection) => selection.kind === "cantrip")
    .flatMap((selection) =>
      hasValuesPayload(selection.payload)
        ? selection.payload.values
        : hasValuePayload(selection.payload)
          ? [selection.payload.value]
          : [],
    );

  const selectedCantrips = (
    await Promise.all(selectedCantripSlugs.map((slug) => getCatalogEntry<SpellData>("spell", slug)))
  ).filter(Boolean) as CatalogEntry<SpellData>[];

  const cantripGrants = allGrants.filter((grant) => grant.type === "spell" && grant.mode === "cantrip");

  const walkSpeedGrants = allGrants.filter(
    (grant): grant is Extract<Grant, { type: "speed" }> =>
      grant.type === "speed" && grant.mode === "walk",
  );
  const walkSpeedGrant = walkSpeedGrants.sort((left, right) => right.amount - left.amount)[0];

  const darkvisionGrants = allGrants.filter(
    (grant): grant is Extract<Grant, { type: "darkvision" }> => grant.type === "darkvision",
  );
  const darkvisionGrant = darkvisionGrants.sort((left, right) => right.amount - left.amount)[0];

  const proficiencies = {
    skills: uniqueStrings([
      ...selectedClassSkills,
      ...proficiencyValues(allGrants, "skill"),
    ]),
    tools: uniqueStrings([
      ...proficiencyValues(allGrants, "tool"),
      ...classEntry.data.proficiencies.tools,
    ]),
    weapons: uniqueStrings([
      ...proficiencyValues(allGrants, "weapon"),
      ...classEntry.data.proficiencies.weapons,
    ]),
    armor: uniqueStrings([
      ...proficiencyValues(allGrants, "armor"),
      ...classEntry.data.proficiencies.armor,
    ]),
    languages: uniqueStrings(proficiencyValues(allGrants, "language")),
    saves: uniqueStrings([
      ...classEntry.data.proficiencies.saves,
      ...proficiencyValues(allGrants, "save"),
    ]),
  };

  const traits = uniqueStrings(
    allGrants
      .filter((grant) => grant.type === "feature")
      .map((grant) => `${grant.name}|||${grant.description}|||${String(grant.level ?? "")}`),
  ).map((value) => {
    const [name, description, level] = value.split("|||");
    return {
      name,
      description,
      sourceLabel: level ? `Level ${level}` : "Feature",
      level: level ? Number(level) : undefined,
    };
  });

  const passivePerception =
    10 +
    modifiers.wis +
    (proficiencies.skills.some((skill) => skill.toLowerCase() === "perception")
      ? proficiencyBonus
      : 0);
  const spellAttackModifier = proficiencyBonus + modifiers.wis;
  const estimatedHitPoints = Math.max(
    character.level,
    estimatedHitPointsForLevel(character.level, classEntry.data.hitDie, modifiers.con),
  );

  return {
    character,
    abilityScores,
    modifiers,
    proficiencyBonus,
    initiative: modifiers.dex,
    passivePerception,
    estimatedHitPoints,
    spellAttackModifier,
    preparedSpellCapacity: Math.max(1, character.level + modifiers.wis),
    cantripsKnown:
      (DRUID_CANTRIP_LEVELS[10] && character.level >= 10
        ? DRUID_CANTRIP_LEVELS[10]
        : character.level >= 4
          ? DRUID_CANTRIP_LEVELS[4]
          : DRUID_CANTRIP_LEVELS[1]) + cantripGrants.length,
    spellSlots: DRUID_SPELL_SLOTS[character.level],
    walkSpeed: walkSpeedGrant?.amount ?? 30,
    darkvision: darkvisionGrant?.amount,
    proficiencies,
    traits,
    feats: featEntries,
    selectedSpells: uniqueStrings([
      ...spellEntries.map((entry) => entry.slug),
      ...selectedCantrips.map((entry) => entry.slug),
    ])
      .map((slug) => {
        const spell =
          spellEntries.find((entry) => entry.slug === slug) ??
          selectedCantrips.find((entry) => entry.slug === slug);
        return spell!;
      })
      .filter(Boolean),
  } satisfies CharacterSheet;
}

async function availableSpellEntries() {
  return listCatalogEntries<SpellData>("spell");
}

async function availableFeatEntries() {
  return listCatalogEntries<FeatData>("feat");
}

async function availableEquipmentEntries() {
  return listCatalogEntries<EquipmentData>("equipment");
}

function systemEquipmentChoices(equipment: Awaited<ReturnType<typeof availableEquipmentEntries>>) {
  const simpleWeapons = equipment.filter((entry) =>
    entry.data.category.toLowerCase().includes("simple"),
  );
  const simpleMeleeWeapons = equipment.filter((entry) =>
    entry.data.category.toLowerCase().includes("simple melee"),
  );
  const druidicFoci = equipment.filter((entry) =>
    entry.data.category.toLowerCase().includes("druidic focus"),
  );
  const shield = equipment.find((entry) => entry.slug === "shield");
  const scimitar = equipment.find((entry) => entry.slug === "scimitar");

  return [
    {
      id: systemSelectionKey("equipment:first"),
      label: "Starting equipment: shield or simple weapon",
      type: "one-of" as const,
      minLevel: 1,
      maxSelections: 1,
      options: [
        ...(shield
          ? [
              {
                value: shield.slug,
                label: shield.name,
              },
            ]
          : []),
        ...simpleWeapons.map((entry) => ({
          value: entry.slug,
          label: entry.name,
        })),
      ],
    },
    {
      id: systemSelectionKey("equipment:second"),
      label: "Starting equipment: scimitar or simple melee weapon",
      type: "one-of" as const,
      minLevel: 1,
      maxSelections: 1,
      options: [
        ...(scimitar
          ? [
              {
                value: scimitar.slug,
                label: scimitar.name,
              },
            ]
          : []),
        ...simpleMeleeWeapons.map((entry) => ({
          value: entry.slug,
          label: entry.name,
        })),
      ],
    },
    {
      id: systemSelectionKey("equipment:focus"),
      label: "Choose a druidic focus",
      type: "one-of" as const,
      minLevel: 1,
      maxSelections: 1,
      options: druidicFoci.map((entry) => ({
        value: entry.slug,
        label: entry.name,
      })),
    },
  ];
}

export async function getPendingChoices(characterId: string, forLevel?: number) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    return null;
  }

  const character = bundle.character;
  const targetLevel = forLevel ?? character.level;
  const currentSelections = selectionMap(bundle.selections);
  const sheet = await getCharacterSheet(characterId);
  if (!sheet) {
    return null;
  }

  const lineageEntry = character.lineageSlug
    ? await getCatalogEntry<LineageData>("lineage", character.lineageSlug)
    : null;
  const backgroundEntry = character.backgroundSlug
    ? await getCatalogEntry<BackgroundData>("background", character.backgroundSlug)
    : null;
  const allSpells = await availableSpellEntries();
  const allFeats = await availableFeatEntries();
  const equipment = await availableEquipmentEntries();

  const pending: PendingChoice[] = [];

  if (lineageEntry && lineageEntry.data.variants.length > 0 && !character.lineageVariantSlug) {
    pending.push({
      id: systemSelectionKey("lineage-variant"),
      label: "Choose your lineage variant",
      type: "one-of",
      minLevel: 1,
      maxSelections: 1,
      options: lineageEntry.data.variants.map((variant) => ({
        value: variant.slug,
        label: `${variant.name} (${variant.sourcebook})`,
      })),
      sourceKind: "system",
      sourceSlug: character.id,
    });
  }

  if (!currentSelections.has(classSkillSelectionKey())) {
    pending.push({
      id: classSkillSelectionKey(),
      label: "Choose your druid skill proficiencies",
      type: "many-of",
      minLevel: 1,
      maxSelections: 2,
      options: [
        "Arcana",
        "Animal Handling",
        "Insight",
        "Medicine",
        "Nature",
        "Perception",
        "Religion",
        "Survival",
      ].map((value) => ({ value, label: value })),
      sourceKind: "system",
      sourceSlug: "druid",
    });
  }

  const cantripLevels = [1, 4, 10].filter((level) => level <= character.level);
  for (const level of cantripLevels) {
    const key = cantripSelectionKey(level);
    if (currentSelections.has(key)) {
      continue;
    }
    const count = level === 1 ? 2 : 1;
    pending.push({
      id: key,
      label: level === 1 ? "Choose your starting cantrips" : `Choose your level ${level} cantrip`,
      type: count > 1 ? "many-of" : "one-of",
      minLevel: level,
      maxSelections: count,
      options: allSpells
        .filter(
          (spell) =>
            spell.data.level === 0 &&
            spell.data.spellLists.some((value) => value.toLowerCase() === "druid"),
        )
        .map((spell) => ({
          value: spell.slug,
          label: spell.name,
          description: spell.data.school,
        })),
      sourceKind: "system",
      sourceSlug: "druid",
    });
  }

  for (const choice of systemEquipmentChoices(equipment)) {
    if (!currentSelections.has(choice.id)) {
      pending.push({
        ...choice,
        sourceKind: "system",
        sourceSlug: "druid",
      });
    }
  }

  if (backgroundEntry) {
    for (const choice of backgroundEntry.data.choices) {
      const hydrated = {
        ...choice,
        options: dynamicChoiceOptions(choice, allSpells),
      };
      const key = choiceSelectionKey("background", backgroundEntry.slug, choice.id);
      if (!currentSelections.has(key)) {
        pending.push({
          ...hydrated,
          id: key,
          sourceKind: "background",
          sourceSlug: backgroundEntry.slug,
        });
      }
    }
  }

  if (lineageEntry) {
    const variant = lineageEntry.data.variants.find(
      (entry) => entry.slug === character.lineageVariantSlug,
    );
    const lineageChoices = [
      ...lineageEntry.data.choices,
      ...(variant?.choices ?? []),
    ];
    for (const choice of lineageChoices) {
      const hydrated = {
        ...choice,
        options: dynamicChoiceOptions(choice, allSpells),
      };
      const key = choiceSelectionKey("lineage", lineageEntry.slug, choice.id);
      if (!currentSelections.has(key)) {
        pending.push({
          ...hydrated,
          id: key,
          sourceKind: "lineage",
          sourceSlug: lineageEntry.slug,
        });
      }
    }
  }

  for (const level of DRUID_ASI_LEVELS.filter((value) => value <= character.level)) {
    const modeKey = featModeSelectionKey(level);
    const featKey = featSelectionKey(level);
    const asiKey = asiSelectionKey(level);

    if (!currentSelections.has(modeKey)) {
      pending.push({
        id: modeKey,
        label: `Level ${level}: feat or ability score improvement`,
        type: "one-of",
        minLevel: level,
        maxSelections: 1,
        options: [
          { value: "asi", label: "Ability Score Improvement" },
          { value: "feat", label: "Feat" },
        ],
        sourceKind: "system",
        sourceSlug: `level-${level}`,
      });
      continue;
    }

    const modePayload = currentSelections.get(modeKey);
    const modeValue = modePayload && hasValuePayload(modePayload) ? modePayload.value : null;

    if (modeValue === "asi" && !currentSelections.has(asiKey)) {
      pending.push({
        id: asiKey,
        label: `Assign your level ${level} ability score increase`,
        type: "ability-split",
        minLevel: level,
        maxSelections: 2,
        metadata: {
          domain: "ability",
          amount: 2,
        },
        sourceKind: "system",
        sourceSlug: `level-${level}`,
      });
    }

    if (modeValue === "feat" && !currentSelections.has(featKey)) {
      pending.push({
        id: featKey,
        label: `Choose your level ${level} feat`,
        type: "one-of",
        minLevel: level,
        maxSelections: 1,
        options: allFeats
          .filter((feat) =>
            featEligible(feat, {
              level: character.level,
              spellcasting: true,
              abilities: sheet.abilityScores,
              lineage: lineageEntry?.name,
              proficiencies: {
                armor: sheet.proficiencies.armor,
                weapons: sheet.proficiencies.weapons,
              },
            }),
          )
          .map((feat) => ({
            value: feat.slug,
            label: feat.name,
            description: feat.data.prerequisiteText,
          })),
        sourceKind: "system",
        sourceSlug: `level-${level}`,
      });
      continue;
    }

    if (modeValue === "feat") {
      const featPayload = currentSelections.get(featKey);
      const featSlug = featPayload && hasValuePayload(featPayload) ? featPayload.value : null;
      if (featSlug) {
        const feat = await getCatalogEntry<FeatData>("feat", featSlug);
        if (feat) {
          for (const choice of feat.data.choices) {
            const key = choiceSelectionKey("feat", feat.slug, `${choice.id}-${level}`);
            if (!currentSelections.has(key)) {
              pending.push({
                ...choice,
                id: key,
                options: dynamicChoiceOptions(choice, allSpells),
                sourceKind: "feat",
                sourceSlug: feat.slug,
              });
            }
          }
        }
      }
    }
  }

  if (forLevel) {
    return pending.filter((choice) => choice.minLevel === targetLevel);
  }

  return pending;
}

export async function getCharacterWithChoices(characterId: string) {
  const [sheet, pendingChoices] = await Promise.all([
    getCharacterSheet(characterId),
    getPendingChoices(characterId),
  ]);

  return {
    sheet,
    pendingChoices,
  };
}

export async function listCreationCatalog() {
  const [backgrounds, lineages] = await Promise.all([
    listCatalogEntries<BackgroundData>("background"),
    listCatalogEntries<LineageData>("lineage"),
  ]);

  return {
    backgrounds,
    lineages,
  };
}

export async function getWildShapeOptions(characterId: string) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    return null;
  }

  const beasts = await listCatalogEntries<BeastData>("beast");
  const allowedCr = bundle.character.level >= 8 ? 1 : bundle.character.level >= 4 ? 0.5 : 0.25;
  const canFly = bundle.character.level >= 8;
  const canSwim = bundle.character.level >= 4;

  return beasts
    .filter((entry) => entry.data.challengeRating <= allowedCr)
    .filter((entry) => {
      const movementModes = Object.keys(entry.data.speed).map((mode) => mode.toLowerCase());
      if (!canFly && movementModes.includes("fly")) {
        return false;
      }
      if (!canSwim && movementModes.includes("swim")) {
        return false;
      }
      return true;
    })
    .map((entry) => ({
      ...entry,
      state: bundle.wildShapeStatus[entry.slug] ?? { seen: false, known: false },
    }));
}

export async function listDruidSpells() {
  const spells = await listCatalogEntries<SpellData>("spell");
  return spells.filter(isDruidSpell);
}

export async function listSummonCreatures() {
  const creatures = await listCatalogEntries<CreatureData>("creature");
  return creatures.filter((entry) => entry.data.summonTags.length > 0);
}

export async function getCurrentSummons(characterId: string) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    return null;
  }

  const rows = await database
    .select()
    .from(currentSummons)
    .where(eq(currentSummons.characterId, characterId))
    .orderBy(asc(currentSummons.createdAt), asc(currentSummons.nickname));

  const creatureSlugs = uniqueStrings(rows.map((row) => row.creatureSlug));
  const creatures = (
    await Promise.all(
      creatureSlugs.map((slug) => getCatalogEntry<CreatureData>("creature", slug)),
    )
  ).filter(Boolean) as CatalogEntry<CreatureData>[];

  const creaturesBySlug = new Map(creatures.map((entry) => [entry.slug, entry]));

  return rows
    .map((row) => {
      const creature = creaturesBySlug.get(row.creatureSlug);
      if (!creature) {
        return null;
      }

      return {
        ...parseCurrentSummonRow(row),
        creature,
      } satisfies CurrentSummon;
    })
    .filter((entry): entry is CurrentSummon => Boolean(entry));
}

export async function addCurrentSummon(params: {
  characterId: string;
  creatureSlug: string;
  nickname?: string;
}) {
  const bundle = await getCharacterBundle(params.characterId);
  if (!bundle) {
    throw new Error("Character not found");
  }

  const creature = await getCatalogEntry<CreatureData>("creature", params.creatureSlug);
  if (!creature) {
    throw new Error("Summon creature not found");
  }

  const timestamp = nowIso();
  const maxHitPoints = Math.max(1, creature.data.hitPointValue);

  await database.insert(currentSummons).values({
    id: createId("sum"),
    characterId: params.characterId,
    creatureSlug: params.creatureSlug,
    nickname: normalizeWhitespace(params.nickname ?? creature.name),
    currentHitPoints: maxHitPoints,
    maxHitPoints,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function updateCurrentSummon(params: {
  characterId: string;
  summonId: string;
  nickname?: string;
  currentHitPoints?: number;
  maxHitPoints?: number;
}) {
  const [existing] = await database
    .select()
    .from(currentSummons)
    .where(
      and(
        eq(currentSummons.id, params.summonId),
        eq(currentSummons.characterId, params.characterId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Summon not found");
  }

  const maxHitPoints = Math.max(1, Math.floor(params.maxHitPoints ?? existing.maxHitPoints));
  const currentHitPoints = Math.min(
    maxHitPoints,
    Math.max(0, Math.floor(params.currentHitPoints ?? existing.currentHitPoints)),
  );
  const nickname =
    params.nickname === undefined
      ? existing.nickname
      : normalizeWhitespace(params.nickname) || existing.nickname;

  await database
    .update(currentSummons)
    .set({
      nickname,
      currentHitPoints,
      maxHitPoints,
      updatedAt: nowIso(),
    })
    .where(
      and(
        eq(currentSummons.id, params.summonId),
        eq(currentSummons.characterId, params.characterId),
      ),
    );
}

export async function removeCurrentSummon(characterId: string, summonId: string) {
  await database
    .delete(currentSummons)
    .where(and(eq(currentSummons.id, summonId), eq(currentSummons.characterId, characterId)));
}

export async function getSourceTextPanels(characterId: string) {
  const bundle = await getCharacterBundle(characterId);
  if (!bundle) {
    return [];
  }

  const slugs = [
    bundle.character.classSlug === "druid" ? "druid" : bundle.character.classSlug,
    "druid:shepherd",
    bundle.character.lineageSlug,
    bundle.character.backgroundSlug ? `background:${bundle.character.backgroundSlug}` : null,
  ].filter((value): value is string => Boolean(value));

  const featSelections = bundle.selections
    .filter((selection) => selection.kind === "feat")
    .map((selection) => (hasValuePayload(selection.payload) ? selection.payload.value : null))
    .filter((value): value is string => Boolean(value))
    .map((slug) => `feat:${slug}`);

  const spellSelections = bundle.preparedSpellSlugs.map((slug) => `spell:${slug}`);
  const sourceKeys = Array.from(new Set([...slugs, ...featSelections, ...spellSelections]));

  const rows = await database
    .select()
    .from(sourcePages)
    .where(inArray(sourcePages.slug, sourceKeys));

  const panels: SourceTextPanel[] = [];
  for (const row of rows) {
    const text = await readFile(row.cleanedTextPath, "utf8");
    panels.push({
      title: row.slug,
      sourcebook: row.sourcebook ?? "Unknown",
      sourceUrl: row.url,
      text,
    });
  }

  return panels;
}

export async function getCharacterInventory(characterId: string) {
  return database
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.characterId, characterId))
    .orderBy(asc(inventoryItems.name));
}
