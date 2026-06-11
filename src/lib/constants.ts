export const ABILITIES = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
] as const;

export const ABILITY_LABELS: Record<(typeof ABILITIES)[number], string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const CLASS_SKILLS = [
  "Arcana",
  "Animal Handling",
  "Insight",
  "Medicine",
  "Nature",
  "Perception",
  "Religion",
  "Survival",
] as const;

export const DRUID_CANTRIP_LEVELS = {
  1: 2,
  4: 3,
  10: 4,
} as const;

export const DRUID_ASI_LEVELS = [4, 8, 12, 16, 19] as const;

export const DRUID_WILD_SHAPE_PROGRESSION = [
  { level: 2, maxCr: 0.25, canFly: false, canSwim: false, uses: 2 },
  { level: 4, maxCr: 0.5, canFly: false, canSwim: true, uses: 2 },
  { level: 8, maxCr: 1, canFly: true, canSwim: true, uses: 2 },
] as const;

export const DRUID_SPELL_SLOTS: Record<number, number[]> = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

export const LEVEL_LABELS = Array.from({ length: 20 }, (_, index) => index + 1);
