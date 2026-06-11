import { createHash, randomUUID } from "node:crypto";

import type { Ability, Grant, Trait } from "@/lib/types";

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeWhitespace(input: string) {
  return input.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function stripParenthetical(input: string) {
  return input.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function toChecksum(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean)));
}

export function splitNameDescription(text: string): Trait {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/^([^.:]+)[.:]\s*(.+)$/);

  if (!match) {
    return {
      name: normalized,
      description: normalized,
    };
  }

  return {
    name: normalizeWhitespace(match[1]),
    description: normalizeWhitespace(match[2]),
  };
}

export function parseAbilityBonus(description: string): Grant[] {
  const normalized = normalizeWhitespace(description);
  const directMatches = [
    ...normalized.matchAll(
      /Your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d+)/gi,
    ),
  ];

  const directGrants = directMatches.map((match) => ({
    type: "ability-bonus" as const,
    ability: toAbility(match[1]),
    amount: Number(match[2]),
  }));

  if (directGrants.length > 0) {
    return directGrants;
  }

  return [];
}

export function parseSpeedGrant(description: string): Grant[] {
  const normalized = normalizeWhitespace(description);
  const match = normalized.match(/base walking speed (?:increases to|is) (\d+) feet/i);

  if (!match) {
    return [];
  }

  return [
    {
      type: "speed",
      mode: "walk",
      amount: Number(match[1]),
    },
  ];
}

export function parseDarkvisionGrant(description: string): Grant[] {
  const normalized = normalizeWhitespace(description);
  const match = normalized.match(/darkvision (?:has a range of|within) (\d+) feet/i);

  if (!match) {
    return [];
  }

  return [
    {
      type: "darkvision",
      amount: Number(match[1]),
    },
  ];
}

export function parseProficiencyGrant(description: string): Grant[] {
  const normalized = normalizeWhitespace(description);
  const skillMatch = normalized.match(/proficiency in the ([A-Za-z' -]+) skill/i);

  if (skillMatch) {
    return [
      {
        type: "proficiency",
        category: "skill",
        value: normalizeWhitespace(skillMatch[1]),
      },
    ];
  }

  const skillPluralMatch = normalized.match(/proficiencies?: ([A-Za-z, '&()-]+)$/i);

  if (skillPluralMatch) {
    return uniqueStrings(
      skillPluralMatch[1]
        .replace(/\band\b/gi, ",")
        .split(",")
        .map((value) => normalizeWhitespace(value)),
    ).map((value) => ({
      type: "proficiency" as const,
      category: "skill" as const,
      value,
    }));
  }

  return [];
}

export function parseLanguagesGrant(description: string): Grant[] {
  const normalized = normalizeWhitespace(description);

  if (!normalized.startsWith("Languages.")) {
    return [];
  }

  if (/one additional language of your choice/i.test(normalized)) {
    return [];
  }

  const cleaned = normalized
    .replace(/^Languages\.\s*/i, "")
    .replace(/you can (speak, )?read, and write /i, "")
    .replace(/\.$/, "");

  return uniqueStrings(
    cleaned
      .replace(/\band\b/gi, ",")
      .split(",")
      .map((value) => normalizeWhitespace(value)),
  ).map((value) => ({
    type: "proficiency" as const,
    category: "language" as const,
    value,
  }));
}

export function parseTraitGrants(description: string) {
  return [
    ...parseAbilityBonus(description),
    ...parseSpeedGrant(description),
    ...parseDarkvisionGrant(description),
    ...parseProficiencyGrant(description),
    ...parseLanguagesGrant(description),
  ];
}

export function toAbility(label: string): Ability {
  const normalized = label.toLowerCase().slice(0, 3);

  if (
    normalized !== "str" &&
    normalized !== "dex" &&
    normalized !== "con" &&
    normalized !== "int" &&
    normalized !== "wis" &&
    normalized !== "cha"
  ) {
    throw new Error(`Unsupported ability label: ${label}`);
  }

  return normalized;
}

export function modifierForScore(score: number) {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonusForLevel(level: number) {
  return Math.ceil(level / 4) + 1;
}

export function isOfficialSource(sourcebook: string) {
  const normalized = sourcebook.toLowerCase();
  return !normalized.includes("unearthed arcana") && !normalized.includes("homebrew");
}
