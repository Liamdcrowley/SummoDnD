import { asc, eq } from "drizzle-orm";

import { getCatalogEntry, listCatalogEntries } from "@/lib/catalog";
import { database } from "@/lib/db";
import { parseJson, stringifyJson } from "@/lib/json";
import { boardEntries } from "@/lib/schema";
import type {
  BoardEntry,
  BoardEntryRecord,
  StatBlock,
  StatBlockSection,
  SummonScalingInput,
  SummonableData,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

function cloneStatBlock(statBlock: StatBlock) {
  return structuredClone(statBlock);
}

function ordinal(level: number) {
  if (level % 100 >= 11 && level % 100 <= 13) {
    return `${level}th`;
  }

  if (level % 10 === 1) {
    return `${level}st`;
  }

  if (level % 10 === 2) {
    return `${level}nd`;
  }

  if (level % 10 === 3) {
    return `${level}rd`;
  }

  return `${level}th`;
}

function clampHitPoints(value: number, maxHitPoints: number) {
  return Math.max(0, Math.min(maxHitPoints, Math.round(value)));
}

function patchSections(
  sections: StatBlockSection[],
  patcher: (section: StatBlockSection) => StatBlockSection,
) {
  return sections.map((section) => patcher({ ...section, entries: [...section.entries] }));
}

function replaceTextTemplates(text: string, scaling: SummonScalingInput) {
  return text
    .replace(/summonSpellLevel/g, String(scaling.slotLevel))
    .replace(/your spell attack modifier to hit/gi, `${formatSigned(scaling.spellAttackBonus)} to hit`)
    .replace(/your spell attack modifier/gi, formatSigned(scaling.spellAttackBonus))
    .replace(/your spell save DC/gi, `DC ${scaling.spellSaveDC}`);
}

function transformGeneratedText(statBlock: StatBlock, scaling: SummonScalingInput) {
  const transform = (sections: StatBlockSection[]) =>
    patchSections(sections, (section) => ({
      ...section,
      entries: section.entries.map((entry) => replaceTextTemplates(entry, scaling)),
    }));

  statBlock.traits = transform(statBlock.traits);
  statBlock.actions = transform(statBlock.actions);
  statBlock.bonusActions = transform(statBlock.bonusActions);
  statBlock.reactions = transform(statBlock.reactions);
  statBlock.spellcasting = transform(statBlock.spellcasting);
  statBlock.notes = (statBlock.notes ?? []).map((entry) => replaceTextTemplates(entry, scaling));
}

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function setSectionText(
  sections: StatBlockSection[],
  sectionName: string,
  entries: string[],
) {
  return sections.map((section) =>
    section.name === sectionName
      ? {
          ...section,
          entries,
        }
      : section,
  );
}

function generatedMaxHitPoints(statBlock: StatBlock, scaling: SummonScalingInput, minimumSlotLevel: number) {
  const aboveBase = scaling.slotLevel - minimumSlotLevel;

  if (statBlock.name.startsWith("Bestial Spirit")) {
    const base = statBlock.name.includes("(Air)") ? 20 : 30;
    return base + aboveBase * 5;
  }

  if (statBlock.name.startsWith("Fey Spirit")) {
    return 30 + aboveBase * 10;
  }

  if (statBlock.name.startsWith("Elemental Spirit")) {
    return 50 + aboveBase * 10;
  }

  if (statBlock.name.startsWith("Draconic Spirit")) {
    return 50 + aboveBase * 10;
  }

  return statBlock.maxHitPoints;
}

function generatedArmorClass(statBlock: StatBlock, scaling: SummonScalingInput) {
  if (statBlock.name.startsWith("Bestial Spirit")) {
    return 11 + scaling.slotLevel;
  }

  if (statBlock.name.startsWith("Fey Spirit")) {
    return 12 + scaling.slotLevel;
  }

  if (statBlock.name.startsWith("Elemental Spirit")) {
    return 11 + scaling.slotLevel;
  }

  if (statBlock.name.startsWith("Draconic Spirit")) {
    return 14 + scaling.slotLevel;
  }

  return statBlock.armorClassValue ?? 0;
}

function generatedMultiattackCount(statBlock: StatBlock, scaling: SummonScalingInput) {
  if (
    statBlock.name.startsWith("Bestial Spirit") ||
    statBlock.name.startsWith("Fey Spirit") ||
    statBlock.name.startsWith("Elemental Spirit") ||
    statBlock.name.startsWith("Draconic Spirit")
  ) {
    return Math.max(1, Math.floor(scaling.slotLevel / 2));
  }

  return 1;
}

function materializeGeneratedSummon(
  summonable: { data: SummonableData; name: string },
  scaling: SummonScalingInput,
) {
  const generatedBySpell = summonable.data.generatedBySpell;
  if (!generatedBySpell || !summonable.data.generationKey) {
    throw new Error("Generated summon is missing its spell metadata.");
  }

  if (scaling.slotLevel < generatedBySpell.minimumSlotLevel) {
    throw new Error(
      `${generatedBySpell.name} requires at least a ${ordinal(generatedBySpell.minimumSlotLevel)}-level slot.`,
    );
  }

  const statBlock = cloneStatBlock(summonable.data.statBlock);
  const maxHitPoints = generatedMaxHitPoints(
    statBlock,
    scaling,
    generatedBySpell.minimumSlotLevel,
  );
  const armorClassValue = generatedArmorClass(statBlock, scaling);
  const multiattackCount = generatedMultiattackCount(statBlock, scaling);

  statBlock.maxHitPoints = maxHitPoints;
  statBlock.hitPoints = `${maxHitPoints} (summoned with a ${ordinal(scaling.slotLevel)}-level slot)`;
  statBlock.armorClassValue = armorClassValue;
  statBlock.armorClass = `${armorClassValue} (natural armor)`;
  statBlock.notes = [
    `Summoned with a ${ordinal(scaling.slotLevel)}-level spell slot.`,
    `Spell attack bonus: ${formatSigned(scaling.spellAttackBonus)}.`,
    `Spell save DC: ${scaling.spellSaveDC}.`,
  ];

  if (summonable.data.generationKey === "summon-beast") {
    statBlock.actions = setSectionText(statBlock.actions, "Multiattack", [
      `The beast makes ${multiattackCount} attacks.`,
    ]);
  }

  if (summonable.data.generationKey === "summon-fey") {
    statBlock.actions = setSectionText(statBlock.actions, "Multiattack", [
      `The fey makes ${multiattackCount} attacks.`,
    ]);
  }

  if (summonable.data.generationKey === "summon-elemental") {
    statBlock.actions = setSectionText(statBlock.actions, "Multiattack", [
      `The elemental makes ${multiattackCount} attacks.`,
    ]);
  }

  if (summonable.data.generationKey === "summon-draconic-spirit") {
    statBlock.actions = setSectionText(statBlock.actions, "Multiattack", [
      `The dragon makes ${multiattackCount} Rend attacks and uses Breath Weapon.`,
    ]);
  }

  transformGeneratedText(statBlock, scaling);
  return statBlock;
}

function parseBoardEntryRow(row: typeof boardEntries.$inferSelect): BoardEntryRecord {
  return {
    id: row.id,
    summonableSlug: row.summonableSlug,
    nickname: row.nickname,
    currentHitPoints: row.currentHitPoints,
    maxHitPoints: row.maxHitPoints,
    statBlockSnapshot: parseJson<StatBlock>(row.statBlockSnapshot),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listSummonables() {
  return listCatalogEntries<SummonableData>("summonable");
}

export async function getSummonable(slug: string) {
  return getCatalogEntry<SummonableData>("summonable", slug);
}

export async function getBoardEntries() {
  const rows = await database.query.boardEntries.findMany({
    orderBy: [asc(boardEntries.createdAt), asc(boardEntries.nickname)],
  });

  const records = rows.map((row) => parseBoardEntryRow(row));
  const summonableMap = new Map(
    (
      await Promise.all(
        unique(records.map((entry) => entry.summonableSlug)).map(async (slug) => [
          slug,
          await getSummonable(slug),
        ]),
      )
    ).filter((entry): entry is [string, NonNullable<Awaited<ReturnType<typeof getSummonable>>>] => Boolean(entry[1])),
  );

  return records.map((record) => ({
    ...record,
    summonable: summonableMap.get(record.summonableSlug) ?? null,
  })) satisfies BoardEntry[];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export async function addBoardEntry(params: {
  summonableSlug: string;
  nickname?: string;
  scaling?: SummonScalingInput;
}) {
  const summonable = await getSummonable(params.summonableSlug);
  if (!summonable) {
    throw new Error("Summonable creature not found.");
  }

  const statBlock =
    summonable.data.summonableKind === "generated"
      ? materializeGeneratedSummon(summonable, params.scaling ?? {
          slotLevel: summonable.data.generatedBySpell?.minimumSlotLevel ?? 1,
          spellAttackBonus: 0,
          spellSaveDC: 10,
        })
      : cloneStatBlock(summonable.data.statBlock);

  const timestamp = nowIso();
  const row = {
    id: createId("board"),
    summonableSlug: summonable.slug,
    nickname: params.nickname?.trim() || summonable.name,
    currentHitPoints: statBlock.maxHitPoints,
    maxHitPoints: statBlock.maxHitPoints,
    statBlockSnapshot: stringifyJson(statBlock),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.insert(boardEntries).values(row);

  return {
    id: row.id,
    summonableSlug: row.summonableSlug,
    nickname: row.nickname,
    currentHitPoints: row.currentHitPoints,
    maxHitPoints: row.maxHitPoints,
    statBlockSnapshot: statBlock,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    summonable,
  } satisfies BoardEntry;
}

export async function updateBoardEntry(params: {
  id: string;
  nickname?: string;
  currentHitPoints?: number;
}) {
  const existing = await database.query.boardEntries.findFirst({
    where: eq(boardEntries.id, params.id),
  });

  if (!existing) {
    throw new Error("Board entry not found.");
  }

  const currentHitPoints =
    params.currentHitPoints !== undefined
      ? clampHitPoints(params.currentHitPoints, existing.maxHitPoints)
      : existing.currentHitPoints;

  const nickname =
    params.nickname !== undefined ? params.nickname.trim() || existing.nickname : existing.nickname;

  const updatedAt = nowIso();

  await database
    .update(boardEntries)
    .set({
      nickname,
      currentHitPoints,
      updatedAt,
    })
    .where(eq(boardEntries.id, params.id));

  const summonable = await getSummonable(existing.summonableSlug);
  return {
    ...parseBoardEntryRow({
      ...existing,
      nickname,
      currentHitPoints,
      updatedAt,
    }),
    summonable,
  } satisfies BoardEntry;
}

export async function removeBoardEntry(id: string) {
  await database.delete(boardEntries).where(eq(boardEntries.id, id));
}

export const summonInternals = {
  clampHitPoints,
  generatedArmorClass,
  generatedMaxHitPoints,
  generatedMultiattackCount,
  materializeGeneratedSummon,
  replaceTextTemplates,
};
