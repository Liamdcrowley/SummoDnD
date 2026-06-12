import { describe, expect, it } from "vitest";

import {
  extractAttackActions,
  extractFollowUpActions,
  formatAttackRoutine,
  rollAttackAction,
} from "@/lib/combat-rolls";
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
        damageParts: [
          { formula: "2d4 + 2", type: "piercing" },
          { formula: "1d6", type: "fire" },
        ],
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
    expect(attacks[0]?.damageParts).toEqual([{ flat: 1, type: "piercing" }]);
  });

  it("keeps direct extra damage parts from the hit", () => {
    const attacks = extractAttackActions(
      buildStatBlock([
        {
          name: "Bite",
          entries: [
            "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d10 + 2) piercing damage plus 5 (1d10) poison damage, and the target is grappled (escape DC 13).",
          ],
        },
      ]),
    );

    expect(attacks[0]?.damageParts).toEqual([
      { formula: "1d10 + 2", type: "piercing" },
      { formula: "1d10", type: "poison" },
    ]);
  });

  it("adds a separate shillelagh attack for dryad-style club entries", () => {
    const attacks = extractAttackActions(
      buildStatBlock([
        {
          name: "Club",
          entries: [
            "Melee Weapon Attack: +2 to hit (+6 to hit with shillelagh), reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage, or 8 (1d8 + 4) bludgeoning damage with shillelagh.",
          ],
        },
      ]),
    );

    expect(attacks[0]?.attackBonus).toBe(2);
    expect(attacks[0]?.damageFormulas).toEqual(["1d4"]);
    expect(attacks[1]).toEqual({
      id: "action-0-0-Club-shillelagh",
      name: "Shillelagh",
      attackBonus: 6,
      damageParts: [{ formula: "1d8 + 4", type: "bludgeoning" }],
      damageFormulas: ["1d8 + 4"],
      flatDamage: [],
    });
  });

  it("describes multiattack when present", () => {
    const statBlock = buildStatBlock([
      {
        name: "Multiattack",
        entries: ["The bear makes two attacks: one with its bite and one with its claws."],
      },
    ]);

    expect(formatAttackRoutine(statBlock)).toBe(
      "The bear makes two attacks: one with its bite and one with its claws.",
    );
    expect(formatAttackRoutine(buildStatBlock([]))).toBe("1 attack");
  });

  it("rolls the d20 and damage totals", () => {
    const result = rollAttackAction(
      {
        id: "bite",
        name: "Bite",
        attackBonus: 4,
        damageParts: [
          { formula: "2d4 + 2", type: "piercing" },
          { formula: "1d6", type: "fire" },
          { flat: 1 },
        ],
        damageFormulas: ["2d4 + 2", "1d6"],
        flatDamage: [1],
      },
      () => 0,
    );

    expect(result).toEqual({
      d20: 1,
      attackTotal: 5,
      damageTotal: 6,
      damageParts: [
        { total: 4, type: "piercing" },
        { total: 1, type: "fire" },
        { total: 1 },
      ],
    });
  });

  it("finds follow-up attack actions such as swallow", () => {
    const statBlock = buildStatBlock([
      {
        name: "Bite",
        entries: [
          "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d10 + 2) piercing damage.",
        ],
      },
      {
        name: "Swallow",
        entries: [
          "The toad makes one bite attack against a Medium or smaller target it is grappling. If the attack hits, the target is swallowed.",
        ],
      },
    ]);

    expect(extractFollowUpActions(statBlock)).toEqual([
      {
        id: "follow-up-1-Swallow",
        name: "Swallow",
        summary:
          "The toad makes one bite attack against a Medium or smaller target it is grappling. If the attack hits, the target is swallowed.",
      },
    ]);
  });
});
