import { proficiencyBonusForLevel } from "@/lib/utils";

export const LANGUAGE_OPTIONS = [
  "Abyssal",
  "Celestial",
  "Common",
  "Deep Speech",
  "Draconic",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Infernal",
  "Orc",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

export const SKILL_OPTIONS = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

export function getLanguageOptions() {
  return LANGUAGE_OPTIONS;
}

export function getSkillOptions() {
  return SKILL_OPTIONS;
}

export function validatePreparedSpellLimit(level: number, wisdomModifier: number) {
  return Math.max(1, level + wisdomModifier);
}

export function spellSaveDc(level: number, wisdomModifier: number) {
  return 8 + proficiencyBonusForLevel(level) + wisdomModifier;
}

export function abilityModifierLabel(score: number) {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}
