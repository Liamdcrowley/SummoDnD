import { describe, expect, it } from "vitest";

import { extractAttackActions, rollAttackAction } from "@/lib/combat-rolls";
import type { StatBlock } from "@/lib/types";

function buildStatBlock(actions: StatBlock["actions"]): StatBlock {
  return {
    name: "Test Beast",
    size: "Medium",
    type: "Beast",
    alignment: "Unaligned",
    armorClass: "12",
    maxHitPoints: 10,
    hitPoints: "10",
    speed: { walk: "30 ft." },
    abilities: { str: 10, dex: 10, con: 10, int: 3, wis: 10, cha: 6 },
    savingThrows: [],
    skills: [],
    senses: [],
    languages: [],
    challengeRating: "1",
    challengeRatingValue: 1,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    spellcasting: [],
    traits: [],
    actions,
    bonusActions: [],
    reactions: [],
    sourceAttribution: {
      sourcebook: "Test",
      sourceUrl: "https://example.com",
      license: "test",
      official: false,
    },
  };
}

describe("combat rolls", () => {
  it("extracts to-hit attacks with all immediate damage dice", () => {
    const attacks = extractAttackActions(
      buildStatBlock([
        {
          name: "Bite",
          entries: [
            "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage plus 3 (1d6) fire damage.",
          ],
        },
      ]),
    );

    expect(attacks).toEqual([
      {
        id: "action-0-0-Bite",
        name: "Bite",
        attackBonus: 4,
        damageFormulas: ["2d4 + 2", "1d6"],
        flatDamage: [],
      },
    ]);
  });

  it("keeps flat damage but ignores conditional save damage", () => {
    const attacks = extractAttackActions(
      buildStatBlock([
        {
          name: "Sting",
          entries: [
            "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 1 piercing damage, and the target must make a DC 10 Constitution saving throw, taking 5 (2d4) poison damage on a failed save.",
          ],
        },
      ]),
    );

    expect(attacks[0]?.flatDamage).toEqual([1]);
    expect(attacks[0]?.damageFormulas).toEqual([]);
  });

  it("uses the first listed damage option for alternate attacks", () => {
    const attacks = extractAttackActions(
      buildStatBlock([
        {
          name: "Quarterstaff",
          entries: [
            "Melee Weapon Attack: +2 to hit (+6 to hit with shillelagh), reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage, or 8 (1d8 + 4) bludgeoning damage with shillelagh.",
          ],
        },
      ]),
    );

    expect(attacks[0]?.attackBonus).toBe(2);
    expect(attacks[0]?.damageFormulas).toEqual(["1d4"]);
  });

  it("rolls the d20 and damage totals", () => {
    const result = rollAttackAction(
      {
        id: "bite",
        name: "Bite",
        attackBonus: 4,
        damageFormulas: ["2d4 + 2", "1d6"],
        flatDamage: [1],
      },
      () => 0,
    );

    expect(result).toEqual({
      d20: 1,
      attackTotal: 5,
      damageTotal: 6,
    });
  });
});
