import type { StatBlock, StatBlockSection } from "@/lib/types";

export type AttackAction = {
  id: string;
  name: string;
  attackBonus: number;
  damageParts: AttackDamagePart[];
  damageFormulas: string[];
  flatDamage: number[];
};

export type AttackDamagePart = {
  formula?: string;
  flat?: number;
  type?: string;
};

export type AttackRollResult = {
  d20: number;
  critical: boolean;
  attackTotal: number;
  damageTotal: number;
  damageParts: Array<{
    total: number;
    type?: string;
  }>;
};

export type FollowUpAction = {
  id: string;
  name: string;
  summary: string;
};

type RollDetail = {
  total: number;
};

const attackBonusPattern = /([+-])\s*(\d+)\s+to hit/i;
const diceFormulaPattern = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/gi;
const damagePartPattern =
  /(?:(?:\d+\s+)?\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)|(\d+))\s+([a-z][a-z ]*?)\s+damage/gi;
const flatDamagePattern = /(?:^|plus\s+|,\s*)(\d+)(?!\s*\()\s+[^,.]*?damage/gi;
const shillelaghBonusPattern = /\(([+-])\s*(\d+)\s+to hit with shillelagh\)/i;
const shillelaghDamagePattern =
  /or\s+\d+\s+\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+([a-z][a-z ]*?)\s+damage with shillelagh/i;

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

function normalizeDamageType(type: string) {
  return type.replace(/\s+/g, " ").trim();
}

function parseDamage(text: string) {
  const clause = primaryHitClause(text);
  const damageParts = Array.from(clause.matchAll(damagePartPattern), (match) => {
    const formula = match[1] ? normalizeDiceFormula(match[1]) : undefined;
    const flat = match[2] ? Number(match[2]) : undefined;
    const type = match[3] ? normalizeDamageType(match[3]) : undefined;

    return {
      ...(formula ? { formula } : {}),
      ...(flat !== undefined && Number.isFinite(flat) ? { flat } : {}),
      ...(type ? { type } : {}),
    } satisfies AttackDamagePart;
  }).filter((part) => part.formula || part.flat !== undefined);
  const matchedFormulas = new Set(damageParts.map((part) => part.formula).filter(Boolean));
  const damageFormulas = Array.from(clause.matchAll(diceFormulaPattern), (match) =>
    normalizeDiceFormula(match[1] ?? ""),
  ).filter(Boolean);
  const untypedFormulaParts = damageFormulas
    .filter((formula) => !matchedFormulas.has(formula))
    .map((formula) => ({ formula }) satisfies AttackDamagePart);
  const flatDamage = Array.from(clause.matchAll(flatDamagePattern), (match) =>
    Number(match[1]),
  ).filter((value) => Number.isFinite(value));

  return {
    damageFormulas,
    flatDamage,
    damageParts: [...damageParts, ...untypedFormulaParts],
  };
}

function parseShillelaghAttack(
  section: StatBlockSection,
  sectionKind: string,
  sectionIndex: number,
  entry: string,
  entryIndex: number,
) {
  if (!/shillelagh/i.test(entry)) {
    return null;
  }

  const bonusMatch = shillelaghBonusPattern.exec(entry);
  const damageMatch = shillelaghDamagePattern.exec(entry);
  if (!bonusMatch || !damageMatch) {
    return null;
  }

  const sign = bonusMatch[1] === "-" ? -1 : 1;
  const formula = normalizeDiceFormula(damageMatch[1] ?? "");
  const type = normalizeDamageType(damageMatch[2] ?? "");

  return {
    id: `${sectionKind}-${sectionIndex}-${entryIndex}-${section.name}-shillelagh`,
    name: "Shillelagh",
    attackBonus: sign * Number(bonusMatch[2]),
    damageParts: [{ formula, type }].filter((part) => part.formula),
    damageFormulas: [formula].filter(Boolean),
    flatDamage: [],
  } satisfies AttackAction;
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

      const { damageFormulas, flatDamage, damageParts } = parseDamage(entry);

      const baseAttack = {
        id: `${sectionKind}-${sectionIndex}-${entryIndex}-${section.name}`,
        name: section.name,
        attackBonus,
        damageParts,
        damageFormulas,
        flatDamage,
      } satisfies AttackAction;
      const shillelaghAttack = parseShillelaghAttack(
        section,
        sectionKind,
        sectionIndex,
        entry,
        entryIndex,
      );

      return shillelaghAttack ? [baseAttack, shillelaghAttack] : [baseAttack];
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

export function formatAttackRoutine(statBlock: Pick<StatBlock, "actions">) {
  const multiattack = statBlock.actions.find(
    (section) => section.name.toLowerCase() === "multiattack",
  );

  return multiattack ? multiattack.entries.join(" ") : "1 attack";
}

export function extractFollowUpActions(statBlock: Pick<StatBlock, "actions">) {
  return statBlock.actions.flatMap((section, sectionIndex) => {
    if (section.name.toLowerCase() === "multiattack") {
      return [];
    }

    const summary = section.entries.join(" ");
    if (parseAttackBonus(summary) !== null) {
      return [];
    }

    if (!/\bmakes?\s+(?:one\s+)?[a-z\s-]*attack\b/i.test(summary)) {
      return [];
    }

    return [
      {
        id: `follow-up-${sectionIndex}-${section.name}`,
        name: section.name,
        summary,
      } satisfies FollowUpAction,
    ];
  });
}

function rollDie(sides: number, random: () => number) {
  return Math.floor(random() * sides) + 1;
}

function rollDiceFormula(
  formula: string,
  random: () => number,
  options: { critical?: boolean } = {},
): RollDetail {
  const match = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i.exec(formula.trim());
  if (!match) {
    return { total: 0 };
  }

  const count = Number(match[1]);
  const diceCount = options.critical ? count * 2 : count;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;
  const diceTotal = Array.from({ length: diceCount }, () => rollDie(sides, random)).reduce(
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
  const critical = d20 === 20;
  const fallbackDamageParts: AttackDamagePart[] = [
    ...attack.damageFormulas.map((formula) => ({ formula }) satisfies AttackDamagePart),
    ...attack.flatDamage.map((flat) => ({ flat }) satisfies AttackDamagePart),
  ];
  const damageParts: AttackDamagePart[] =
    attack.damageParts.length > 0
      ? attack.damageParts
      : fallbackDamageParts;
  const damageRolls = damageParts.map((part) => ({
    total: part.formula
      ? rollDiceFormula(part.formula, random, { critical }).total
      : (part.flat ?? 0),
    ...(part.type ? { type: part.type } : {}),
  }));
  const damageTotal = damageRolls.reduce((sum, roll) => sum + roll.total, 0);

  return {
    d20,
    critical,
    attackTotal: d20 + attack.attackBonus,
    damageTotal,
    damageParts: damageRolls,
  } satisfies AttackRollResult;
}

export const combatRollInternals = {
  primaryHitClause,
};
