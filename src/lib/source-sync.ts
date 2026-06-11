import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import * as cheerio from "cheerio";

import { deleteCatalogEntriesByKind, upsertCatalogEntry, upsertSourcePage } from "@/lib/catalog";
import { rawDir } from "@/lib/paths";
import {
  DRUID_SUMMON_MANIFEST,
  SUMMON_SOURCE_ORDER,
  type ExistingSummonManifestEntry,
  type GeneratedSummonManifestEntry,
} from "@/lib/summon-manifest";
import type {
  AbilityScores,
  CatalogEntry,
  SourceAttribution,
  StatBlock,
  StatBlockSection,
  SummonSourceKey,
  SummonableData,
} from "@/lib/types";
import {
  normalizeWhitespace,
  slugify,
  toChecksum,
  uniqueStrings,
} from "@/lib/utils";

const WIKIDOT_BASE_URL = "https://dnd5e.wikidot.com";
const WIKIDOT_LICENSE = "CC-BY-SA 3.0";
const FIVEETOOLS_RAW_BASE_URL =
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-2014-src/main";
const FIVEETOOLS_LICENSE = "Public mirror data via 5etools JSON";
const USER_AGENT = "DruidSummonBoard/1.0 (+local sync)";
const PRE_2024_CUTOFF = "2024-01-01";
const ALLOWED_SOURCEBOOKS = new Set([
  "Monster Manual",
  "Mordenkainen's Tome of Foes",
  "Mordenkainen Presents: Monsters of the Multiverse",
  "Tasha's Cauldron of Everything",
  "Fizban's Treasury of Dragons",
  "Bigby Presents: Glory of the Giants",
  "Volo's Guide to Monsters",
  "Baldur's Gate: Descent Into Avernus",
  "Boo's Astral Menagerie",
  "Chains of Asmodeus",
  "Dragons of Stormwreck Isle",
  "Eberron: Rising from the Last War",
  "Explorer's Guide to Wildemount",
  "Ghosts of Saltmarsh",
  "Guildmasters' Guide to Ravnica",
  "Icewind Dale: Rime of the Frostmaiden",
  "Infernal Machine Rebuild",
  "Journeys through the Radiant Citadel",
  "Out of the Abyss",
  "Strixhaven: A Curriculum of Chaos",
  "The Book of Many Things",
  "The Wild Beyond the Witchlight",
  "Tomb of Annihilation",
  "Van Richten's Guide to Ravenloft",
  "Waterdeep: Dragon Heist",
  "Waterdeep: Dungeon of the Mad Mage",
]);

const SIZE_LABELS: Record<string, string> = {
  T: "Tiny",
  S: "Small",
  M: "Medium",
  L: "Large",
  H: "Huge",
  G: "Gargantuan",
  V: "Varies",
};

const ALIGNMENT_LABELS: Record<string, string> = {
  L: "Lawful",
  N: "Neutral",
  C: "Chaotic",
  G: "Good",
  E: "Evil",
  U: "Unaligned",
  A: "Any alignment",
  NX: "Neutral",
  NY: "Neutral",
};

const ATTACK_TAGS: Record<string, string> = {
  mw: "Melee Weapon Attack:",
  rw: "Ranged Weapon Attack:",
  "mw,rw": "Melee or Ranged Weapon Attack:",
  ms: "Melee Spell Attack:",
  rs: "Ranged Spell Attack:",
  "ms,rs": "Melee or Ranged Spell Attack:",
};

type LoadedWikidotPage = {
  url: string;
  sourceSlug: string;
  title: string;
  cleanedText: string;
  lines: string[];
  html: string;
};

type SyncSummary = {
  sourcePages: number;
  catalogEntries: number;
  counts: Record<string, number>;
};

type SourceIndexItem = {
  name: string;
  source: string;
  published: string;
};

type BestiaryIndex = Record<string, string>;

type RawMonster = {
  name: string;
  source: string;
  page?: number;
  size?: unknown;
  type?: unknown;
  alignment?: unknown;
  ac?: unknown;
  hp?: unknown;
  speed?: unknown;
  str?: unknown;
  dex?: unknown;
  con?: unknown;
  int?: unknown;
  wis?: unknown;
  cha?: unknown;
  save?: unknown;
  skill?: unknown;
  senses?: unknown;
  passive?: unknown;
  languages?: unknown;
  cr?: unknown;
  vulnerable?: unknown;
  resist?: unknown;
  immune?: unknown;
  conditionImmune?: unknown;
  spellcasting?: unknown;
  trait?: unknown;
  action?: unknown;
  bonus?: unknown;
  reaction?: unknown;
  summonedBySpell?: unknown;
  summonedBySpellLevel?: unknown;
  _versions?: RawMonsterVersion[];
  [key: string]: unknown;
};

type RawMonsterVersion = {
  name: string;
  source?: string;
  _mod?: Record<string, unknown>;
  [key: string]: unknown;
};

type BestiaryFilePayload = {
  monster?: RawMonster[];
};

function toSourceSlug(url: string) {
  return url.replace(`${WIKIDOT_BASE_URL}/`, "");
}

function safeFileName(input: string) {
  return input.replace(/[:/\\?<>|*"]/g, "_");
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function writeSnapshot(
  kind: string,
  slug: string,
  raw: string,
  cleaned: string,
  extension: string,
) {
  const folder = join(rawDir, kind);
  await mkdir(folder, { recursive: true });

  const baseName = safeFileName(slug);
  const rawPath = join(folder, `${baseName}.${extension}`);
  const textPath = join(folder, `${baseName}.txt`);

  await writeFile(rawPath, raw, "utf8");
  await writeFile(textPath, cleaned, "utf8");

  return { rawPath, textPath };
}

async function persistTextSourcePage(
  url: string,
  slug: string,
  kind: string,
  sourcebook: string | undefined,
  raw: string,
  cleaned: string,
  license: string,
) {
  const { rawPath, textPath } = await writeSnapshot(kind, slug, raw, cleaned, "html");
  await upsertSourcePage({
    url,
    slug,
    kind,
    sourcebook,
    checksum: toChecksum(raw),
    rawHtmlPath: rawPath,
    cleanedTextPath: textPath,
    parseStatus: "parsed",
    official: true,
    license,
  });
}

async function persistJsonSourcePage(
  url: string,
  slug: string,
  kind: string,
  sourcebook: string | undefined,
  payload: unknown,
  license: string,
) {
  const raw = JSON.stringify(payload, null, 2);
  const { rawPath, textPath } = await writeSnapshot(kind, slug, raw, raw, "json");
  await upsertSourcePage({
    url,
    slug,
    kind,
    sourcebook,
    checksum: toChecksum(raw),
    rawHtmlPath: rawPath,
    cleanedTextPath: textPath,
    parseStatus: "parsed",
    official: true,
    license,
  });
}

function getWikidotLines($: cheerio.CheerioAPI) {
  const content = $("#page-content").clone();
  content.find("#toc, script, style").remove();

  const lines: string[] = [];
  content.children().each((_, node) => {
    const element = content.children().eq(_);
    const tag = node.tagName?.toLowerCase();

    if (!tag) {
      return;
    }

    if (tag === "ul" || tag === "ol") {
      element.find("li").each((itemIndex) => {
        const value = normalizeWhitespace(element.find("li").eq(itemIndex).text());
        if (value) {
          lines.push(value);
        }
      });
      return;
    }

    const value = normalizeWhitespace(element.text());
    if (value) {
      lines.push(value);
    }
  });

  return lines.filter(
    (line) =>
      line !== "Help" &&
      line !== "Terms of Service" &&
      line !== "Privacy" &&
      !line.startsWith("Powered by"),
  );
}

async function loadWikidotPage(url: string) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($(".page-title span").first().text());
  const lines = getWikidotLines($);

  return {
    url,
    sourceSlug: toSourceSlug(url),
    title,
    cleanedText: lines.join("\n\n"),
    lines,
    html,
  } satisfies LoadedWikidotPage;
}

function lineValue(lines: string[], prefix: string) {
  const line = lines.find((value) => value.includes(prefix));
  if (!line) {
    return undefined;
  }

  const [, tail = ""] = line.split(prefix);
  return normalizeWhitespace(tail);
}

async function mapPool<T, R>(values: T[], worker: (value: T) => Promise<R>, concurrency = 8) {
  const queue = [...values];
  const results: R[] = [];

  const runners = Array.from({ length: Math.min(concurrency, values.length || 1) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      results.push(await worker(next));
    }
  });

  await Promise.all(runners);
  return results;
}

function toSourceAttribution(
  sourcebook: string,
  sourceUrl: string,
  license = FIVEETOOLS_LICENSE,
): SourceAttribution {
  return {
    sourcebook,
    sourceUrl,
    license,
    official: true,
  };
}

function parseFractionalNumber(value: string) {
  if (value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  return Number(value);
}

function normalizeChallengeRating(cr: unknown) {
  if (cr === null || cr === undefined) {
    return {
      label: "--",
      value: null,
    };
  }

  if (typeof cr === "number") {
    return {
      label: String(cr),
      value: cr,
    };
  }

  if (typeof cr === "string") {
    return {
      label: cr,
      value: parseFractionalNumber(cr),
    };
  }

  if (typeof cr === "object" && cr !== null && "cr" in cr) {
    const label = String((cr as { cr?: unknown }).cr ?? "--");
    return {
      label,
      value: label === "--" ? null : parseFractionalNumber(label),
    };
  }

  return {
    label: "--",
    value: null,
  };
}

function normalizeSize(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return "Medium";
  }

  const first = value[0];
  if (typeof first === "string") {
    return SIZE_LABELS[first] ?? first;
  }

  return normalizeWhitespace(String(first));
}

function normalizeAlignment(value: unknown): string {
  if (typeof value === "string") {
    return ALIGNMENT_LABELS[value] ?? value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeAlignment(item))
      .filter(Boolean)
      .join(" ");
  }

  if (value && typeof value === "object" && "alignment" in value) {
    return normalizeAlignment((value as { alignment?: unknown }).alignment);
  }

  return "";
}

function normalizeMonsterType(value: unknown): string {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (!value || typeof value !== "object") {
    return "Unknown";
  }

  const rawType = normalizeWhitespace(String((value as { type?: unknown }).type ?? "Unknown"));
  const tags = (value as { tags?: unknown }).tags;

  if (!Array.isArray(tags) || tags.length === 0) {
    return rawType;
  }

  const renderedTags = tags
    .map((tag) => {
      if (typeof tag === "string") {
        return tag;
      }

      if (tag && typeof tag === "object" && "tag" in tag) {
        return normalizeWhitespace(String((tag as { tag?: unknown }).tag ?? ""));
      }

      return "";
    })
    .filter(Boolean);

  if (renderedTags.length === 0) {
    return rawType;
  }

  return `${rawType} (${renderedTags.join(", ")})`;
}

function monsterTypeKey(value: unknown) {
  if (typeof value === "string") {
    return normalizeWhitespace(value).toLowerCase();
  }

  if (value && typeof value === "object" && "type" in value) {
    return normalizeWhitespace(String((value as { type?: unknown }).type ?? "")).toLowerCase();
  }

  return "";
}

function parseArmorClass(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return { label: "--", numeric: null as number | null };
  }

  const labels = value.map((entry) => {
    if (typeof entry === "number") {
      return String(entry);
    }

    if (entry && typeof entry === "object") {
      const acEntry = entry as {
        ac?: unknown;
        from?: unknown;
        condition?: unknown;
        special?: unknown;
      };

      if (acEntry.special) {
        return normalizeWhitespace(String(acEntry.special));
      }

      const base = acEntry.ac !== undefined ? String(acEntry.ac) : "";
      const from = Array.isArray(acEntry.from)
        ? ` (${acEntry.from.map((item) => renderInlineTags(String(item))).join(", ")})`
        : "";
      const condition = acEntry.condition
        ? ` ${renderInlineTags(String(acEntry.condition))}`
        : "";
      return normalizeWhitespace(`${base}${from}${condition}`);
    }

    return normalizeWhitespace(String(entry));
  });

  const first = value[0];
  const numeric =
    typeof first === "number"
      ? first
      : first && typeof first === "object" && "ac" in first
        ? Number((first as { ac?: unknown }).ac ?? Number.NaN)
        : null;

  return {
    label: labels.join("; "),
    numeric: Number.isFinite(numeric ?? Number.NaN) ? numeric : null,
  };
}

function parseHitPoints(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      label: "--",
      maxHitPoints: 0,
      hitDice: undefined as string | undefined,
    };
  }

  const hp = value as { average?: unknown; formula?: unknown; special?: unknown };
  if (hp.special) {
    const label = normalizeWhitespace(renderInlineTags(String(hp.special)));
    const firstNumber = label.match(/\d+/);
    return {
      label,
      maxHitPoints: firstNumber ? Number(firstNumber[0]) : 0,
      hitDice: undefined,
    };
  }

  const average = Number(hp.average ?? 0);
  const formula = normalizeWhitespace(String(hp.formula ?? ""));
  return {
    label: formula ? `${average} (${formula})` : String(average),
    maxHitPoints: average,
    hitDice: formula || undefined,
  };
}

function parseSpeed(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const speedRecord = value as Record<string, unknown>;
  const entries: Record<string, string> = {};

  for (const [mode, rawValue] of Object.entries(speedRecord)) {
    if (mode === "canHover") {
      continue;
    }

    if (typeof rawValue === "number") {
      entries[mode] = `${rawValue} ft.`;
      continue;
    }

    if (typeof rawValue === "string") {
      entries[mode] = normalizeWhitespace(rawValue);
      continue;
    }

    if (rawValue && typeof rawValue === "object") {
      const objectValue = rawValue as { number?: unknown; condition?: unknown };
      const amount = objectValue.number !== undefined ? `${objectValue.number} ft.` : "";
      const condition = objectValue.condition
        ? ` ${renderInlineTags(String(objectValue.condition))}`
        : "";
      entries[mode] = normalizeWhitespace(`${amount}${condition}`);
    }
  }

  return entries;
}

function normalizeAbilityScore(value: unknown) {
  const numeric = Number(value ?? 10);
  return Number.isFinite(numeric) ? numeric : 10;
}

function normalizeAbilityScores(monster: RawMonster): AbilityScores {
  return {
    str: normalizeAbilityScore(monster.str),
    dex: normalizeAbilityScore(monster.dex),
    con: normalizeAbilityScore(monster.con),
    int: normalizeAbilityScore(monster.int),
    wis: normalizeAbilityScore(monster.wis),
    cha: normalizeAbilityScore(monster.cha),
  };
}

function normalizeLabeledRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).map(
    ([name, amount]) => `${name.replace(/\b\w/g, (match) => match.toUpperCase())} ${amount}`,
  );
}

function normalizeSenses(value: unknown, passive: unknown) {
  const senses = Array.isArray(value)
    ? value.map((entry) => normalizeWhitespace(renderInlineTags(String(entry))))
    : [];

  if (passive !== undefined && passive !== null) {
    senses.push(`passive Perception ${passive}`);
  }

  return uniqueStrings(senses);
}

function normalizeLanguages(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeWhitespace(renderInlineTags(String(entry))))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return [normalizeWhitespace(renderInlineTags(value))];
  }

  return [];
}

function normalizeProtectionList(
  value: unknown,
  key?: "resist" | "immune" | "vulnerable",
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [normalizeWhitespace(renderInlineTags(entry))];
    }

    if (!entry || typeof entry !== "object") {
      return [];
    }

    const nested = key ? (entry as Record<string, unknown>)[key] : undefined;
    const note = normalizeWhitespace(String((entry as { note?: unknown }).note ?? ""));
    const renderedNested = normalizeProtectionList(
      Array.isArray(nested) ? nested : nested !== undefined ? [nested] : [],
    );

    if (renderedNested.length === 0) {
      return note ? [note] : [];
    }

    const joined = renderedNested.join(", ");
    return [normalizeWhitespace(`${joined}${note ? ` ${note}` : ""}`)];
  });
}

function normalizeConditionImmunities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [normalizeWhitespace(renderInlineTags(entry))];
    }

    if (entry && typeof entry === "object" && "conditionImmune" in entry) {
      return normalizeConditionImmunities((entry as { conditionImmune?: unknown }).conditionImmune);
    }

    return [];
  });
}

function renderInlineTags(text: string) {
  return normalizeWhitespace(
    text
      .replace(/\{@h\}/g, "Hit: ")
      .replace(/\{@hitYourSpellAttack\}/g, "your spell attack modifier")
      .replace(/\{@dc ([^}]+)\}/g, "DC $1")
      .replace(/\{@hit ([^}]+)\}/g, "+$1")
      .replace(/\{@recharge(?: ([^}]+))?\}/g, (_, value: string | undefined) =>
        value ? `(Recharge ${value}-6)` : "(Recharge 6)",
      )
      .replace(/\{@atk ([^}]+)\}/g, (_, value: string) => ATTACK_TAGS[value] ?? "Attack:")
      .replace(/\{@(damage|dice|condition|spell|creature|item|sense|status|skill|race|language|book|filter) ([^}|]+)(?:\|[^}]*)?\}/g, "$2")
      .replace(/\{@(b|i|italic|bold) ([^}]+)\}/g, "$2")
      .replace(/\{@note ([^}]+)\}/g, "$1")
      .replace(/\{@link ([^}|]+)\|[^}]+\}/g, "$1")
      .replace(/\{@scaledice ([^}|]+)(?:\|[^}]*)?\}/g, "$1")
      .replace(/\{@chance ([^}]+)\}/g, "$1%")
      .replace(/\{@[^ }]+ ([^}|]+)(?:\|[^}]*)?\}/g, "$1"),
  );
}

function renderEntryNode(entry: unknown): string[] {
  if (typeof entry === "string") {
    return [renderInlineTags(entry)];
  }

  if (Array.isArray(entry)) {
    return entry.flatMap((item) => renderEntryNode(item));
  }

  if (!entry || typeof entry !== "object") {
    return [];
  }

  const entryRecord = entry as Record<string, unknown>;
  const type = typeof entryRecord.type === "string" ? entryRecord.type : undefined;

  if (type === "list" && Array.isArray(entryRecord.items)) {
    return entryRecord.items.flatMap((item) => {
      const rendered = renderEntryNode(item);
      return rendered.map((line) => `- ${line}`);
    });
  }

  if (type === "item") {
    const name = entryRecord.name ? `${renderInlineTags(String(entryRecord.name))}. ` : "";
    const body = renderEntryNode(entryRecord.entry).join(" ");
    return [normalizeWhitespace(`${name}${body}`)];
  }

  if (type === "entries") {
    const inner = renderEntryNode(entryRecord.entries);
    if (entryRecord.name) {
      return [
        normalizeWhitespace(
          `${renderInlineTags(String(entryRecord.name))}. ${inner.join(" ")}`.trim(),
        ),
      ];
    }
    return inner;
  }

  if (Array.isArray(entryRecord.entries)) {
    return renderEntryNode(entryRecord.entries);
  }

  if (entryRecord.entry) {
    return renderEntryNode(entryRecord.entry);
  }

  return [];
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [] satisfies StatBlockSection[];
  }

  return value.map((entry) => {
    const record = entry as { name?: unknown; entries?: unknown };
    return {
      name: normalizeWhitespace(renderInlineTags(String(record.name ?? "Unnamed"))),
      entries: renderEntryNode(record.entries).filter(Boolean),
    } satisfies StatBlockSection;
  });
}

function normalizeSpellcasting(value: unknown) {
  if (!Array.isArray(value)) {
    return [] satisfies StatBlockSection[];
  }

  return value.map((entry) => {
    const record = entry as Record<string, unknown>;
    const lines: string[] = [];

    lines.push(...renderEntryNode(record.headerEntries));

    if (Array.isArray(record.will) && record.will.length > 0) {
      lines.push(`At will: ${record.will.map((spell) => renderInlineTags(String(spell))).join(", ")}`);
    }

    if (record.daily && typeof record.daily === "object") {
      for (const [key, spells] of Object.entries(record.daily as Record<string, unknown>)) {
        if (!Array.isArray(spells)) {
          continue;
        }

        const label = key.endsWith("e")
          ? `${key.slice(0, -1)}/day each`
          : `${key}/day`;

        lines.push(`${label}: ${spells.map((spell) => renderInlineTags(String(spell))).join(", ")}`);
      }
    }

    if (record.spells && typeof record.spells === "object") {
      for (const [level, block] of Object.entries(record.spells as Record<string, unknown>)) {
        if (!block || typeof block !== "object") {
          continue;
        }

        const spells = Array.isArray((block as { spells?: unknown }).spells)
          ? ((block as { spells?: unknown[] }).spells ?? [])
              .map((spell) => renderInlineTags(String(spell)))
              .join(", ")
          : "";

        if (spells) {
          const slots = (block as { slots?: unknown }).slots;
          const label =
            slots !== undefined ? `${level} level (${slots} slots)` : `${level} level`;
          lines.push(`${label}: ${spells}`);
        }
      }
    }

    lines.push(...renderEntryNode(record.footerEntries));

    return {
      name: normalizeWhitespace(renderInlineTags(String(record.name ?? "Spellcasting"))),
      entries: lines.filter(Boolean),
    } satisfies StatBlockSection;
  });
}

function toTitleCaseWords(input: string) {
  return input.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeMonsterToStatBlock(
  monster: RawMonster,
  sourcebook: string,
  sourceUrl: string,
): StatBlock {
  const armorClass = parseArmorClass(monster.ac);
  const hitPoints = parseHitPoints(monster.hp);
  const challengeRating = normalizeChallengeRating(monster.cr);

  return {
    name: monster.name,
    size: normalizeSize(monster.size),
    type: toTitleCaseWords(normalizeMonsterType(monster.type)),
    alignment: normalizeAlignment(monster.alignment) || "Unaligned",
    armorClass: armorClass.label,
    armorClassValue: armorClass.numeric,
    hitPoints: hitPoints.label,
    maxHitPoints: hitPoints.maxHitPoints,
    hitDice: hitPoints.hitDice,
    speed: parseSpeed(monster.speed),
    abilities: normalizeAbilityScores(monster),
    savingThrows: normalizeLabeledRecord(monster.save),
    skills: normalizeLabeledRecord(monster.skill),
    senses: normalizeSenses(monster.senses, monster.passive),
    languages: normalizeLanguages(monster.languages),
    challengeRating: challengeRating.label,
    challengeRatingValue: challengeRating.value,
    damageVulnerabilities: normalizeProtectionList(monster.vulnerable, "vulnerable"),
    damageResistances: normalizeProtectionList(monster.resist, "resist"),
    damageImmunities: normalizeProtectionList(monster.immune, "immune"),
    conditionImmunities: normalizeConditionImmunities(monster.conditionImmune),
    spellcasting: normalizeSpellcasting(monster.spellcasting),
    traits: normalizeSections(monster.trait),
    actions: normalizeSections(monster.action),
    bonusActions: normalizeSections(monster.bonus),
    reactions: normalizeSections(monster.reaction),
    sourceAttribution: toSourceAttribution(sourcebook, sourceUrl),
  };
}

function isPre2024Source(sourceCode: string, sourceMap: Map<string, SourceIndexItem>) {
  const source = sourceMap.get(sourceCode);
  return Boolean(source && source.published < PRE_2024_CUTOFF);
}

function isAllowedSourcebook(sourceCode: string, sourceMap: Map<string, SourceIndexItem>) {
  const sourcebook = sourceMap.get(sourceCode)?.name;
  return Boolean(sourcebook && ALLOWED_SOURCEBOOKS.has(sourcebook));
}

function buildSummonableSlug(monster: RawMonster) {
  return slugify(`${monster.name}-${monster.source}`);
}

function hasTemplateMonsterName(entry: GeneratedSummonManifestEntry, monster: RawMonster) {
  return monster.name === entry.templateMonsterName;
}

function applyArrayModifiers(base: unknown[], modifiers: unknown) {
  if (!Array.isArray(modifiers)) {
    return base;
  }

  let next = [...base];

  for (const modifier of modifiers) {
    if (!modifier || typeof modifier !== "object") {
      continue;
    }

    const record = modifier as Record<string, unknown>;

    if (record.mode === "removeArr" && Array.isArray(record.names)) {
      const names = new Set(record.names.map((name) => String(name)));
      next = next.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return true;
        }
        return !names.has(String((entry as { name?: unknown }).name ?? ""));
      });
      continue;
    }

    if (record.mode === "renameArr" && record.renames && typeof record.renames === "object") {
      const renames = record.renames as { rename?: unknown; with?: unknown };
      next = next.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return entry;
        }
        if (String((entry as { name?: unknown }).name ?? "") !== String(renames.rename ?? "")) {
          return entry;
        }
        return {
          ...(entry as Record<string, unknown>),
          name: renames.with,
        };
      });
      continue;
    }
  }

  return next;
}

function applyObjectModifier(base: RawMonster, field: string, modifier: unknown) {
  if (!modifier || typeof modifier !== "object") {
    return;
  }

  const record = modifier as Record<string, unknown>;

  if (record.mode === "replaceArr") {
    const existing = Array.isArray(base[field]) ? [...(base[field] as unknown[])] : [];
    const replaceName = String(record.replace ?? "");
    const replacement = record.items;
    const index = existing.findIndex(
      (entry) => entry && typeof entry === "object" && String((entry as { name?: unknown }).name ?? "") === replaceName,
    );

    if (index !== -1) {
      existing.splice(index, 1, replacement);
      base[field] = existing;
    }
  }
}

function materializeVersion(baseMonster: RawMonster, versionName: string) {
  const version = baseMonster._versions?.find((item) => item.name === versionName);
  if (!version) {
    return null;
  }

  const next = structuredClone(baseMonster);
  delete next._versions;

  for (const [key, value] of Object.entries(version)) {
    if (key === "_mod") {
      continue;
    }

    if (key === "name" || key === "source") {
      (next as Record<string, unknown>)[key] = value;
      continue;
    }

    (next as Record<string, unknown>)[key] = value;
  }

  if (version._mod && typeof version._mod === "object") {
    for (const [field, modifier] of Object.entries(version._mod)) {
      if (modifier && typeof modifier === "object" && (modifier as { mode?: unknown }).mode === "replaceArr") {
        applyObjectModifier(next, field, modifier);
        continue;
      }

      if (Array.isArray((next as Record<string, unknown>)[field])) {
        (next as Record<string, unknown>)[field] = applyArrayModifiers(
          (next as Record<string, unknown>)[field] as unknown[],
          modifier,
        );
        continue;
      }

      applyObjectModifier(next, field, modifier);
    }
  }

  return next;
}

function sourceKeysForMonster(monster: RawMonster, manifestEntries: ExistingSummonManifestEntry[]) {
  const challengeRating = normalizeChallengeRating(monster.cr).value;
  const normalizedType = monsterTypeKey(monster.type);

  return manifestEntries
    .filter((entry) => {
      const eligibility = entry.eligibility;

      if (eligibility.mode === "familiar-list") {
        return eligibility.names.includes(monster.name);
      }

      if (eligibility.mode === "name-list") {
        return eligibility.names.includes(monster.name);
      }

      if (eligibility.mode === "type-and-max-cr") {
        return (
          normalizedType === eligibility.creatureType &&
          challengeRating !== null &&
          challengeRating <= eligibility.maxChallengeRating
        );
      }

      return false;
    })
    .map((entry) => entry.key);
}

function sourceBookForMonster(monster: RawMonster, sourceMap: Map<string, SourceIndexItem>) {
  return sourceMap.get(monster.source)?.name ?? monster.source;
}

function sortSummonSources(sourceKeys: SummonSourceKey[]) {
  return [...sourceKeys].sort(
    (left, right) =>
      SUMMON_SOURCE_ORDER.indexOf(left) - SUMMON_SOURCE_ORDER.indexOf(right),
  );
}

function buildExistingSummonableEntry(
  monster: RawMonster,
  sourceKeys: SummonSourceKey[],
  sourceMap: Map<string, SourceIndexItem>,
  sourceUrl: string,
): CatalogEntry<SummonableData> {
  const sourcebook = sourceBookForMonster(monster, sourceMap);
  const statBlock = normalizeMonsterToStatBlock(monster, sourcebook, sourceUrl);

  return {
    kind: "summonable",
    slug: buildSummonableSlug(monster),
    name: monster.name,
    source: statBlock.sourceAttribution,
    searchText: [
      monster.name,
      statBlock.type,
      statBlock.size,
      statBlock.challengeRating,
      sourcebook,
      ...sourceKeys,
      ...statBlock.traits.map((section) => section.name),
      ...statBlock.actions.map((section) => section.name),
    ].join(" "),
    data: {
      summonableKind: "existing-creature",
      summonSources: sortSummonSources(sourceKeys),
      statBlock,
    },
  };
}

function buildGeneratedSummonEntry(
  monster: RawMonster,
  manifestEntry: GeneratedSummonManifestEntry,
  sourceUrl: string,
): CatalogEntry<SummonableData> {
  const statBlock = normalizeMonsterToStatBlock(
    monster,
    manifestEntry.sourcebook,
    sourceUrl,
  );

  return {
    kind: "summonable",
    slug: buildSummonableSlug(monster),
    name: monster.name,
    source: statBlock.sourceAttribution,
    searchText: [
      monster.name,
      statBlock.type,
      statBlock.size,
      manifestEntry.key,
      manifestEntry.sourcebook,
      manifestEntry.spellName,
    ].join(" "),
    data: {
      summonableKind: "generated",
      summonSources: [manifestEntry.key],
      statBlock,
      generatedBySpell: {
        name: manifestEntry.spellName,
        slug: manifestEntry.spellSlug,
        minimumSlotLevel: manifestEntry.minimumSlotLevel,
      },
      generationKey: manifestEntry.generationKey,
    },
  };
}

function mergeSummonableEntries(
  existing: CatalogEntry<SummonableData>,
  incoming: CatalogEntry<SummonableData>,
) {
  return {
    ...existing,
    searchText: uniqueStrings(`${existing.searchText} ${incoming.searchText}`.split(" ")).join(" "),
    data: {
      ...existing.data,
      summonSources: sortSummonSources(
        uniqueStrings([
          ...existing.data.summonSources,
          ...incoming.data.summonSources,
        ]) as SummonSourceKey[],
      ) as SummonSourceKey[],
    },
  } satisfies CatalogEntry<SummonableData>;
}

async function syncSummonSourcePages() {
  const urls = uniqueStrings(DRUID_SUMMON_MANIFEST.map((entry) => entry.sourceUrl));
  const pages = await mapPool(urls, loadWikidotPage, 4);

  await Promise.all(
    pages.map(async (page) => {
      const matchingManifest = DRUID_SUMMON_MANIFEST.find((entry) => entry.sourceUrl === page.url);
      const sourcebook =
        lineValue(page.lines, "Source: ") ??
        matchingManifest?.sourcebook ??
        "Unknown";

      await persistTextSourcePage(
        page.url,
        page.sourceSlug,
        "summon-source",
        sourcebook,
        page.html,
        page.cleanedText,
        WIKIDOT_LICENSE,
      );
    }),
  );

  return pages.length;
}

async function loadSourceMap() {
  const url = `${FIVEETOOLS_RAW_BASE_URL}/data/generated/gendata-nav-adventure-book-index.json`;
  const payload = await fetchJson<{ adventure?: SourceIndexItem[]; book?: SourceIndexItem[] }>(url);
  await persistJsonSourcePage(url, "gendata-nav-adventure-book-index", "source-index", "Various", payload, FIVEETOOLS_LICENSE);

  const sourceMap = new Map<string, SourceIndexItem>();
  for (const item of [...(payload.book ?? []), ...(payload.adventure ?? [])]) {
    sourceMap.set(item.source, item);
  }

  return sourceMap;
}

async function loadBestiaryFiles(sourceMap: Map<string, SourceIndexItem>) {
  const indexUrl = `${FIVEETOOLS_RAW_BASE_URL}/data/bestiary/index.json`;
  const index = await fetchJson<BestiaryIndex>(indexUrl);
  await persistJsonSourcePage(indexUrl, "bestiary-index", "bestiary-index", "Various", index, FIVEETOOLS_LICENSE);

  const allowedFiles = Object.entries(index).filter(([sourceCode]) =>
    isPre2024Source(sourceCode, sourceMap) && isAllowedSourcebook(sourceCode, sourceMap),
  );

  return mapPool(
    allowedFiles,
    async ([sourceCode, fileName]) => {
      const url = `${FIVEETOOLS_RAW_BASE_URL}/data/bestiary/${fileName}`;
      const payload = await fetchJson<BestiaryFilePayload>(url);
      const sourcebook = sourceMap.get(sourceCode)?.name ?? sourceCode;
      await persistJsonSourcePage(
        url,
        `bestiary-${sourceCode.toLowerCase()}`,
        "bestiary-file",
        sourcebook,
        payload,
        FIVEETOOLS_LICENSE,
      );

      return {
        sourceCode,
        fileName,
        url,
        payload,
      };
    },
    6,
  );
}

function collectSummonables(
  bestiaryFiles: Awaited<ReturnType<typeof loadBestiaryFiles>>,
  sourceMap: Map<string, SourceIndexItem>,
) {
  const existingManifestEntries = DRUID_SUMMON_MANIFEST.filter(
    (entry): entry is ExistingSummonManifestEntry => entry.kind === "existing-creature",
  );
  const generatedManifestEntries = DRUID_SUMMON_MANIFEST.filter(
    (entry): entry is GeneratedSummonManifestEntry => entry.kind === "generated",
  );
  const generatedTemplateMap = new Map<string, { monster: RawMonster; sourceUrl: string }>();
  const entries = new Map<string, CatalogEntry<SummonableData>>();

  for (const file of bestiaryFiles) {
    for (const monster of file.payload.monster ?? []) {
      if (!isPre2024Source(monster.source, sourceMap)) {
        continue;
      }

      if (!isAllowedSourcebook(monster.source, sourceMap)) {
        continue;
      }

      const generatedEntry = generatedManifestEntries.find((entry) =>
        hasTemplateMonsterName(entry, monster),
      );

      if (generatedEntry) {
        generatedTemplateMap.set(generatedEntry.templateMonsterName, {
          monster,
          sourceUrl: file.url,
        });
      }

      const sourceKeys = sourceKeysForMonster(monster, existingManifestEntries);
      if (sourceKeys.length === 0) {
        continue;
      }

      const nextEntry = buildExistingSummonableEntry(monster, sourceKeys, sourceMap, file.url);
      const existing = entries.get(nextEntry.slug);
      entries.set(nextEntry.slug, existing ? mergeSummonableEntries(existing, nextEntry) : nextEntry);
    }
  }

  for (const manifestEntry of generatedManifestEntries) {
    const template = generatedTemplateMap.get(manifestEntry.templateMonsterName);
    if (!template) {
      continue;
    }

    for (const versionName of manifestEntry.versionNames) {
      const version = materializeVersion(template.monster, versionName);
      if (!version) {
        continue;
      }

      const generated = buildGeneratedSummonEntry(version, manifestEntry, template.sourceUrl);
      entries.set(generated.slug, generated);
    }
  }

  return dedupeReprintedSummonables([...entries.values()], sourceMap).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function dedupeReprintedSummonables(
  entries: CatalogEntry<SummonableData>[],
  sourceMap: Map<string, SourceIndexItem>,
) {
  const preferredByName = new Map<string, CatalogEntry<SummonableData>>();

  for (const entry of entries) {
    if (entry.data.summonableKind !== "existing-creature") {
      preferredByName.set(entry.name, entry);
      continue;
    }

    const existing = preferredByName.get(entry.name);
    if (!existing) {
      preferredByName.set(entry.name, entry);
      continue;
    }

    preferredByName.set(
      entry.name,
      pickPreferredSummonable(existing, entry, sourceMap),
    );
  }

  return [...preferredByName.values()];
}

function pickPreferredSummonable(
  left: CatalogEntry<SummonableData>,
  right: CatalogEntry<SummonableData>,
  sourceMap: Map<string, SourceIndexItem>,
) {
  const leftSourceCode = extractSourceCode(left.slug);
  const rightSourceCode = extractSourceCode(right.slug);
  const leftPublished = leftSourceCode ? sourceMap.get(leftSourceCode)?.published ?? "" : "";
  const rightPublished = rightSourceCode ? sourceMap.get(rightSourceCode)?.published ?? "" : "";

  if (leftPublished && rightPublished && leftPublished !== rightPublished) {
    return leftPublished < rightPublished ? left : right;
  }

  if (left.source.sourcebook !== right.source.sourcebook) {
    return left.source.sourcebook.localeCompare(right.source.sourcebook) <= 0 ? left : right;
  }

  return left.slug.localeCompare(right.slug) <= 0 ? left : right;
}

function extractSourceCode(slug: string) {
  const match = slug.match(/-([a-z0-9-]+)$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export async function syncSources() {
  const summary: SyncSummary = {
    sourcePages: 0,
    catalogEntries: 0,
    counts: {},
  };

  const summonSourceCount = await syncSummonSourcePages();
  summary.sourcePages += summonSourceCount;
  summary.counts["summon-source-pages"] = summonSourceCount;

  const sourceMap = await loadSourceMap();
  summary.sourcePages += 1;

  const bestiaryFiles = await loadBestiaryFiles(sourceMap);
  summary.sourcePages += bestiaryFiles.length + 1;
  summary.counts["bestiary-files"] = bestiaryFiles.length;

  const summonables = collectSummonables(bestiaryFiles, sourceMap);

  await deleteCatalogEntriesByKind("summonable");
  for (const entry of summonables) {
    await upsertCatalogEntry(entry);
  }

  summary.catalogEntries = summonables.length;
  summary.counts.summonable = summonables.length;
  summary.counts["existing-creature"] = summonables.filter(
    (entry) => entry.data.summonableKind === "existing-creature",
  ).length;
  summary.counts.generated = summonables.filter(
    (entry) => entry.data.summonableKind === "generated",
  ).length;

  return summary;
}

export function validateLevel(level: number) {
  return Math.max(1, Math.min(20, level));
}

export const sourceSyncInternals = {
  dedupeReprintedSummonables,
  extractSourceCode,
  isAllowedSourcebook,
  normalizeChallengeRating,
  normalizeMonsterToStatBlock,
  pickPreferredSummonable,
  renderInlineTags,
  materializeVersion,
  sourceKeysForMonster,
};
