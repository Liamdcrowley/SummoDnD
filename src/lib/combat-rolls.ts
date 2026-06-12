import type { StatBlock, StatBlockSection } from "@/lib/types";

export type AttackAction = {
  id: string;
  name: string;
  attackBonus: number;
  damageFormulas: string[];
  flatDamage: number[];
};

export type AttackRollResult = {
  d20: number;
  attackTotal: number;
  damageTotal: number;
};

type RollDetail = {
  total: number;
};

const attackBonusPattern = /([+-])\s*(\d+)\s+to hit/i;
const diceFormulaPattern = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/gi;
const flatDamagePattern = /(?:^|plus\s+|,\s*)(\d+)(?!\s*\()\s+[^,.]*?damage/gi;

function parseAttackBonus(text: string) {
  const match = attackBonusPattern.exec(text);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  return sign * Number(match[2]);
}

function primaryHitClause(text: string) {
  const hitMatch = /hit\s*:/i.exec(text);
  if (!hitMatch) {
    return "";
  }

  let clause = text.slice(hitMatch.index + hitMatch[0].length).trim();
  const sentenceEnd = clause.search(/\.(?:\s|$)/);
  if (sentenceEnd >= 0) {
    clause = clause.slice(0, sentenceEnd);
  }

  const alternateDamage = clause.search(/(?:,\s*|\s+)or\s+\d/i);
  if (alternateDamage >= 0) {
    clause = clause.slice(0, alternateDamage);
  }

  const savingThrowDamage = clause.search(/(?:,\s*)?and\s+(?:the\s+target\s+)?must\b|saving throw/i);
  if (savingThrowDamage >= 0) {
    clause = clause.slice(0, savingThrowDamage);
  }

  return clause;
}

function normalizeDiceFormula(formula: string) {
  return formula.replace(/\s+/g, " ").trim();
}

function parseDamage(text: string) {
  const clause = primaryHitClause(text);
  const damageFormulas = Array.from(clause.matchAll(diceFormulaPattern), (match) =>
    normalizeDiceFormula(match[1] ?? ""),
  ).filter(Boolean);
  const flatDamage = Array.from(clause.matchAll(flatDamagePattern), (match) =>
    Number(match[1]),
  ).filter((value) => Number.isFinite(value));

  return {
    damageFormulas,
    flatDamage,
  };
}

function extractAttackActionsFromSections(
  sections: StatBlockSection[],
  sectionKind: string,
) {
  return sections.flatMap((section, sectionIndex) =>
    section.entries.flatMap((entry, entryIndex) => {
      const attackBonus = parseAttackBonus(entry);
      if (attackBonus === null) {
        return [];
      }

      const { damageFormulas, flatDamage } = parseDamage(entry);

      return [
        {
          id: `${sectionKind}-${sectionIndex}-${entryIndex}-${section.name}`,
          name: section.name,
          attackBonus,
          damageFormulas,
          flatDamage,
        } satisfies AttackAction,
      ];
    }),
  );
}

export function extractAttackActions(
  statBlock: Pick<StatBlock, "actions" | "bonusActions" | "reactions">,
) {
  return [
    ...extractAttackActionsFromSections(statBlock.actions, "action"),
    ...extractAttackActionsFromSections(statBlock.bonusActions, "bonus-action"),
    ...extractAttackActionsFromSections(statBlock.reactions, "reaction"),
  ];
}

function rollDie(sides: number, random: () => number) {
  return Math.floor(random() * sides) + 1;
}

function rollDiceFormula(formula: string, random: () => number): RollDetail {
  const match = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i.exec(formula.trim());
  if (!match) {
    return { total: 0 };
  }

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;
  const diceTotal = Array.from({ length: count }, () => rollDie(sides, random)).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    total: diceTotal + modifier,
  };
}

export function rollAttackAction(
  attack: AttackAction,
  random: () => number = Math.random,
) {
  const d20 = rollDie(20, random);
  const rolledDamage = attack.damageFormulas
    .map((formula) => rollDiceFormula(formula, random))
    .reduce((sum, roll) => sum + roll.total, 0);
  const flatDamage = attack.flatDamage.reduce((sum, value) => sum + value, 0);

  return {
    d20,
    attackTotal: d20 + attack.attackBonus,
    damageTotal: rolledDamage + flatDamage,
  } satisfies AttackRollResult;
}

export const combatRollInternals = {
  primaryHitClause,
};
