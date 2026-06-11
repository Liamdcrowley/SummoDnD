import {
  clampBoardHitPoints,
  createBoardEntry,
  loadBoardEntries,
  removeBoardEntry,
  saveBoardEntries,
  updateBoardEntry,
} from "@/lib/board-state";
import type { CatalogEntry, SummonableData } from "@/lib/types";

function buildSummonable(name: string, slug: string): CatalogEntry<SummonableData> {
  return {
    kind: "summonable",
    slug,
    name,
    source: {
      sourcebook: "Monster Manual",
      sourceUrl: "https://example.com/monster",
      license: "test",
      official: true,
    },
    searchText: `${name} beast`,
    data: {
      summonableKind: "existing-creature",
      summonSources: ["Conjure Animals"],
      statBlock: {
        name,
        size: "Medium",
        type: "Beast",
        alignment: "Unaligned",
        armorClass: "13 (natural armor)",
        armorClassValue: 13,
        hitPoints: "11 (2d8 + 2)",
        maxHitPoints: 11,
        hitDice: "2d8 + 2",
        speed: { walk: "40 ft." },
        abilities: { str: 12, dex: 14, con: 12, int: 2, wis: 12, cha: 6 },
        savingThrows: [],
        skills: ["Perception +3"],
        senses: ["passive Perception 13"],
        languages: [],
        challengeRating: "1/4",
        challengeRatingValue: 0.25,
        damageVulnerabilities: [],
        damageResistances: [],
        damageImmunities: [],
        conditionImmunities: [],
        spellcasting: [],
        traits: [],
        actions: [],
        bonusActions: [],
        reactions: [],
        sourceAttribution: {
          sourcebook: "Monster Manual",
          sourceUrl: "https://example.com/monster",
          license: "test",
          official: true,
        },
      },
    },
  };
}

describe("board-state", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates fixed creature entries and restores them from local storage", () => {
    const summonable = buildSummonable("Wolf", "wolf");
    const entry = createBoardEntry(summonable);

    saveBoardEntries([entry]);
    const restored = loadBoardEntries([summonable]);

    expect(restored).toHaveLength(1);
    expect(restored[0]?.nickname).toBe("Wolf");
    expect(restored[0]?.currentHitPoints).toBe(11);
    expect(restored[0]?.summonable?.slug).toBe("wolf");
  });

  it("clamps hit point edits and keeps the current nickname when a blank value is submitted", () => {
    const summonable = buildSummonable("Brown Bear", "brown-bear");
    const entry = createBoardEntry(summonable, "Bear A");
    const updated = updateBoardEntry([entry], entry.id, {
      currentHitPoints: 999,
      nickname: "   ",
    });

    expect(updated[0]?.currentHitPoints).toBe(11);
    expect(updated[0]?.nickname).toBe("Bear A");
  });

  it("removes entries by id without touching other copies", () => {
    const summonable = buildSummonable("Giant Owl", "giant-owl");
    const first = createBoardEntry(summonable, "Owl 1");
    const second = createBoardEntry(summonable, "Owl 2");

    const next = removeBoardEntry([first, second], first.id);

    expect(next).toHaveLength(1);
    expect(next[0]?.nickname).toBe("Owl 2");
  });

  it("clamps hit points into the legal range", () => {
    expect(clampBoardHitPoints(15, 11)).toBe(11);
    expect(clampBoardHitPoints(-2, 11)).toBe(0);
    expect(clampBoardHitPoints(6, 11)).toBe(6);
  });
});
