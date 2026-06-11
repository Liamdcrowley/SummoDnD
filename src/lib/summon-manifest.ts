import type { GeneratedSummonKey, SummonSourceKey } from "@/lib/types";

export const SUMMON_SOURCE_ORDER: SummonSourceKey[] = [
  "Conjure Animals",
  "Conjure Woodland Beings",
  "Conjure Elemental",
];

export const WILD_COMPANION_FORMS = [
  "Bat",
  "Cat",
  "Crab",
  "Frog",
  "Hawk",
  "Lizard",
  "Octopus",
  "Owl",
  "Poisonous Snake",
  "Quipper",
  "Rat",
  "Raven",
  "Sea Horse",
  "Spider",
  "Weasel",
] as const;

type ExistingCreatureEligibility =
  | {
      mode: "familiar-list";
      names: readonly string[];
    }
  | {
      mode: "type-and-max-cr";
      creatureType: "beast" | "fey" | "elemental";
      maxChallengeRating: number;
    }
  | {
      mode: "name-list";
      names: readonly string[];
    };

export type ExistingSummonManifestEntry = {
  key: SummonSourceKey;
  kind: "existing-creature";
  sourcebook: string;
  sourceUrl: string;
  eligibility: ExistingCreatureEligibility;
};

export type GeneratedSummonManifestEntry = {
  key: SummonSourceKey;
  kind: "generated";
  sourcebook: string;
  sourceUrl: string;
  spellName: string;
  spellSlug: string;
  generationKey: GeneratedSummonKey;
  minimumSlotLevel: number;
  templateMonsterName: string;
  versionNames: readonly string[];
};

export type SummonManifestEntry =
  | ExistingSummonManifestEntry
  | GeneratedSummonManifestEntry;

export const DRUID_SUMMON_MANIFEST: SummonManifestEntry[] = [
  {
    key: "Conjure Animals",
    kind: "existing-creature",
    sourcebook: "Player's Handbook",
    sourceUrl: "https://dnd5e.wikidot.com/spell:conjure-animals",
    eligibility: {
      mode: "type-and-max-cr",
      creatureType: "beast",
      maxChallengeRating: 2,
    },
  },
  {
    key: "Conjure Woodland Beings",
    kind: "existing-creature",
    sourcebook: "Player's Handbook",
    sourceUrl: "https://dnd5e.wikidot.com/spell:conjure-woodland-beings",
    eligibility: {
      mode: "type-and-max-cr",
      creatureType: "fey",
      maxChallengeRating: 2,
    },
  },
  {
    key: "Conjure Elemental",
    kind: "existing-creature",
    sourcebook: "Player's Handbook",
    sourceUrl: "https://dnd5e.wikidot.com/spell:conjure-elemental",
    eligibility: {
      mode: "type-and-max-cr",
      creatureType: "elemental",
      maxChallengeRating: 9,
    },
  },
];
