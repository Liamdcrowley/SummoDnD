import { summonInternals } from "@/lib/summons";
import type { CatalogEntry, SummonableData } from "@/lib/types";

function buildGeneratedSummon(
  name: string,
  generationKey: NonNullable<SummonableData["generationKey"]>,
  minimumSlotLevel: number,
): CatalogEntry<SummonableData> {
  return {
    kind: "summonable",
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    source: {
      sourcebook: "Test Source",
      sourceUrl: "https://example.com",
      license: "test",
      official: true,
    },
    searchText: name,
    data: {
      summonableKind: "generated",
      summonSources: ["Summon Beast"],
      generationKey,
      generatedBySpell: {
        name,
        slug: generationKey,
        minimumSlotLevel,
      },
      statBlock: {
        name,
        size: "Small",
        type: "Fey",
        alignment: "Unaligned",
        armorClass: "Template",
        armorClassValue: null,
        hitPoints: "Template",
        maxHitPoints: 0,
        speed: { walk: "30 ft." },
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        savingThrows: [],
        skills: [],
        senses: [],
        languages: [],
        challengeRating: "--",
        challengeRatingValue: null,
        damageVulnerabilities: [],
        damageResistances: [],
        damageImmunities: [],
        conditionImmunities: [],
        spellcasting: [],
        traits: [],
        actions: [
          {
            name: "Multiattack",
            entries: ["The creature makes a number of attacks equal to half this spell's level."],
          },
          {
            name: generationKey === "summon-draconic-spirit" ? "Rend" : "Strike",
            entries: [
              "Melee Weapon Attack: your spell attack modifier to hit, reach 5 ft., one target. Hit: 1d8 + 4 + summonSpellLevel damage.",
            ],
          },
          ...(generationKey === "summon-draconic-spirit"
            ? [
                {
                  name: "Breath Weapon",
                  entries: [
                    "Each creature must make a Dexterity saving throw against your spell save DC.",
                  ],
                },
              ]
            : []),
        ],
        bonusActions: [],
        reactions: [],
        sourceAttribution: {
          sourcebook: "Test Source",
          sourceUrl: "https://example.com",
          license: "test",
          official: true,
        },
      },
    },
  };
}

describe("generated summon calculations", () => {
  it("scales Summon Beast board snapshots with slot level and spell attack bonus", () => {
    const summonable = buildGeneratedSummon("Bestial Spirit (Air)", "summon-beast", 2);
    const statBlock = summonInternals.materializeGeneratedSummon(summonable, {
      slotLevel: 4,
      spellAttackBonus: 7,
      spellSaveDC: 15,
    });

    expect(statBlock.armorClass).toBe("15 (natural armor)");
    expect(statBlock.maxHitPoints).toBe(30);
    expect(statBlock.actions[0]?.entries[0]).toBe("The beast makes 2 attacks.");
    expect(statBlock.actions[1]?.entries[0]).toContain("+7 to hit");
    expect(statBlock.actions[1]?.entries[0]).toContain("1d8 + 4 + 4 damage");
  });

  it("scales Summon Draconic Spirit board snapshots with exact multiattack and save DC", () => {
    const summonable = buildGeneratedSummon(
      "Draconic Spirit (Gem)",
      "summon-draconic-spirit",
      5,
    );
    const statBlock = summonInternals.materializeGeneratedSummon(summonable, {
      slotLevel: 7,
      spellAttackBonus: 9,
      spellSaveDC: 17,
    });

    expect(statBlock.armorClass).toBe("21 (natural armor)");
    expect(statBlock.maxHitPoints).toBe(70);
    expect(statBlock.actions[0]?.entries[0]).toBe(
      "The dragon makes 3 Rend attacks and uses Breath Weapon.",
    );
    expect(statBlock.actions[1]?.entries[0]).toContain("+9 to hit");
    expect(statBlock.actions[2]?.entries[0]).toContain("DC 17");
  });

  it("clamps board hit points to the legal range", () => {
    expect(summonInternals.clampHitPoints(999, 44)).toBe(44);
    expect(summonInternals.clampHitPoints(-8, 44)).toBe(0);
    expect(summonInternals.clampHitPoints(19, 44)).toBe(19);
  });
});
