import { DRUID_SUMMON_MANIFEST, SUMMON_SOURCE_ORDER } from "@/lib/summon-manifest";
import { sourceSyncInternals } from "@/lib/source-sync";

describe("druid summon manifest", () => {
  it("covers every planned summon source exactly once", () => {
    expect(DRUID_SUMMON_MANIFEST.map((entry) => entry.key)).toEqual(SUMMON_SOURCE_ORDER);
  });

  it("matches official summon sources for existing creatures", () => {
    const existingEntries = DRUID_SUMMON_MANIFEST.filter(
      (entry) => entry.kind === "existing-creature",
    );

    const wolf = {
      name: "Wolf",
      source: "MM",
      type: "beast",
      cr: "1/4",
    };
    const dryad = {
      name: "Dryad",
      source: "MM",
      type: "fey",
      cr: "1",
    };
    const giantScorpion = {
      name: "Giant Scorpion",
      source: "MM",
      type: "beast",
      cr: "3",
    };
    const airElemental = {
      name: "Air Elemental",
      source: "MM",
      type: "elemental",
      cr: "5",
    };

    expect(sourceSyncInternals.sourceKeysForMonster(wolf as never, existingEntries)).toEqual(
      ["Conjure Animals"],
    );
    expect(sourceSyncInternals.sourceKeysForMonster(dryad as never, existingEntries)).toEqual(
      ["Conjure Woodland Beings"],
    );
    expect(sourceSyncInternals.sourceKeysForMonster(giantScorpion as never, existingEntries)).toEqual(
      [],
    );
    expect(sourceSyncInternals.sourceKeysForMonster(airElemental as never, existingEntries)).toEqual(
      ["Conjure Elemental"],
    );
  });

  it("renders common 5etools inline tags into readable text", () => {
    const rendered = sourceSyncInternals.renderInlineTags(
      "{@atk mw} {@hit 8} to hit. {@h}{@damage 1d8 + 4} bludgeoning damage. Save {@dc 15}.",
    );

    expect(rendered).toContain("Melee Weapon Attack:");
    expect(rendered).toContain("+8 to hit.");
    expect(rendered).toContain("Hit: 1d8 + 4 bludgeoning damage.");
    expect(rendered).toContain("DC 15");
  });

  it("applies generated summon version modifiers", () => {
    const baseMonster = {
      name: "Bestial Spirit",
      source: "TCE",
      trait: [
        { name: "Water Breathing (Water Only)", entries: ["The beast can breathe only underwater."] },
        { name: "Flyby (Air Only)", entries: ["The beast does not provoke opportunity attacks."] },
        { name: "Pack Tactics (Land and Water Only)", entries: ["The beast has advantage."] },
      ],
      action: [
        { name: "Slam", entries: ["Old text."] },
      ],
      _versions: [
        {
          name: "Bestial Spirit (Air)",
          _mod: {
            trait: [
              {
                mode: "removeArr",
                names: ["Water Breathing (Water Only)", "Pack Tactics (Land and Water Only)"],
              },
              {
                mode: "renameArr",
                renames: {
                  rename: "Flyby (Air Only)",
                  with: "Flyby",
                },
              },
            ],
            action: {
              mode: "replaceArr",
              replace: "Slam",
              items: {
                name: "Slam",
                entries: ["New text."],
              },
            },
          },
        },
      ],
    };

    const version = sourceSyncInternals.materializeVersion(
      baseMonster as never,
      "Bestial Spirit (Air)",
    );

    expect(version?.trait).toEqual([
      { name: "Flyby", entries: ["The beast does not provoke opportunity attacks."] },
    ]);
    expect(version?.action).toEqual([{ name: "Slam", entries: ["New text."] }]);
  });

  it("drops reprinted sourcebooks that do not add unique summonables", () => {
    const sourceMap = new Map([
      ["MM", { name: "Monster Manual", source: "MM", published: "2014-09-30" }],
      ["MPMM", { name: "Mordenkainen Presents: Monsters of the Multiverse", source: "MPMM", published: "2022-05-17" }],
    ]);

    const wolfFromMm = {
      kind: "summonable" as const,
      slug: "wolf-mm",
      name: "Wolf",
      source: {
        sourcebook: "Monster Manual",
        sourceUrl: "https://example.com/mm/wolf",
        license: "test",
        official: true,
      },
      searchText: "Wolf",
      data: {
        summonableKind: "existing-creature" as const,
        summonSources: ["Conjure Animals" as const],
        statBlock: {} as never,
      },
    };

    const wolfFromMpmm = {
      ...wolfFromMm,
      slug: "wolf-mpmm",
      source: {
        ...wolfFromMm.source,
        sourcebook: "Mordenkainen Presents: Monsters of the Multiverse",
        sourceUrl: "https://example.com/mpmm/wolf",
      },
    };

    const deduped = sourceSyncInternals.dedupeReprintedSummonables(
      [wolfFromMpmm, wolfFromMm],
      sourceMap as never,
    );

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.source.sourcebook).toBe("Monster Manual");
  });

  it("only allows approved mainline, adventure, and setting sourcebooks", () => {
    const sourceMap = new Map([
      ["MM", { name: "Monster Manual", source: "MM", published: "2014-09-30" }],
      ["PSI", { name: "Plane Shift: Ixalan", source: "PSI", published: "2018-01-09" }],
    ]);

    expect(sourceSyncInternals.isAllowedSourcebook("MM", sourceMap as never)).toBe(true);
    expect(sourceSyncInternals.isAllowedSourcebook("PSI", sourceMap as never)).toBe(false);
  });
});
