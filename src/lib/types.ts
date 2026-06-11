import { ABILITIES } from "@/lib/constants";

export type Ability = (typeof ABILITIES)[number];

export type AbilityScores = Record<Ability, number>;

export type CatalogKind =
  | "class"
  | "subclass"
  | "spell"
  | "feat"
  | "background"
  | "lineage"
  | "equipment"
  | "beast"
  | "creature"
  | "summonable";

export type ChoiceType =
  | "one-of"
  | "many-of"
  | "ability-split"
  | "prepared-spells"
  | "toggle";

export type Grant =
  | {
      type: "ability-bonus";
      ability: Ability;
      amount: number;
    }
  | {
      type: "speed";
      mode: "walk" | "fly" | "swim";
      amount: number;
    }
  | {
      type: "darkvision";
      amount: number;
    }
  | {
      type: "proficiency";
      category: "skill" | "tool" | "weapon" | "armor" | "language" | "save";
      value: string;
    }
  | {
      type: "feature";
      name: string;
      description: string;
      level?: number;
    }
  | {
      type: "spell";
      spellSlug: string;
      mode: "always-known" | "cantrip" | "once-per-rest";
      ability?: Ability;
      minLevel?: number;
    };

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ChoiceDefinition = {
  id: string;
  label: string;
  description?: string;
  type: ChoiceType;
  minLevel: number;
  maxSelections: number;
  options?: ChoiceOption[];
  metadata?: Record<string, string | number | boolean | null>;
};

export type Trait = {
  name: string;
  description: string;
};

export type SourceAttribution = {
  sourcebook: string;
  sourceUrl: string;
  license: string;
  official: boolean;
};

export type DruidFeature = {
  level: number;
  name: string;
  description: string;
  optional?: boolean;
  grants?: Grant[];
  choices?: ChoiceDefinition[];
};

export type ClassData = {
  summary: string[];
  hitDie: number;
  proficiencies: {
    armor: string[];
    weapons: string[];
    tools: string[];
    saves: string[];
  };
  skillChoice: {
    count: number;
    options: string[];
  };
  equipmentText: string[];
  cantripProgression: Record<number, number>;
  spellSlots: Record<number, number[]>;
  subclassSlug: string;
  features: DruidFeature[];
};

export type SubclassData = {
  classSlug: string;
  summary: string[];
  features: DruidFeature[];
};

export type SpellData = {
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string[];
  higherLevel?: string;
  spellLists: string[];
  tags: string[];
};

export type FeatPrerequisite =
  | { type: "spellcasting" }
  | { type: "ability"; ability: Ability; minimum: number }
  | { type: "race"; value: string }
  | { type: "proficiency"; category: "armor" | "weapon"; value: string }
  | { type: "level"; minimum: number };

export type FeatData = {
  prerequisiteText?: string;
  prerequisites: FeatPrerequisite[];
  summary: string[];
  benefits: string[];
  grants: Grant[];
  choices: ChoiceDefinition[];
};

export type BackgroundData = {
  summary: string[];
  skillText: string;
  toolText?: string;
  languageText?: string;
  equipmentText: string;
  featureName?: string;
  featureDescription?: string;
  grants: Grant[];
  choices: ChoiceDefinition[];
};

export type LineageVariant = {
  slug: string;
  name: string;
  summary: string[];
  sourcebook: string;
  traits: Trait[];
  grants: Grant[];
  choices: ChoiceDefinition[];
};

export type LineageData = {
  summary: string[];
  baseTraits: Trait[];
  grants: Grant[];
  choices: ChoiceDefinition[];
  variants: LineageVariant[];
};

export type EquipmentData = {
  category: string;
  cost?: string;
  weight?: string;
  description: string[];
};

export type BeastAction = {
  name: string;
  description: string;
};

export type BeastData = {
  size: string;
  type: string;
  alignment: string;
  armorClass: string;
  hitPoints: string;
  hitPointValue: number;
  challengeRating: number;
  speed: Record<string, string>;
  abilities: AbilityScores;
  skills: string[];
  senses: string[];
  languages: string;
  traits: Trait[];
  actions: BeastAction[];
};

export type CreatureData = BeastData & {
  summonTags: string[];
};

export type StatBlockSection = {
  name: string;
  entries: string[];
};

export type StatBlock = {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: string;
  armorClassValue?: number | null;
  hitPoints: string;
  maxHitPoints: number;
  hitDice?: string;
  speed: Record<string, string>;
  abilities: AbilityScores;
  savingThrows: string[];
  skills: string[];
  senses: string[];
  languages: string[];
  challengeRating: string;
  challengeRatingValue: number | null;
  damageVulnerabilities: string[];
  damageResistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  spellcasting: StatBlockSection[];
  traits: StatBlockSection[];
  actions: StatBlockSection[];
  bonusActions: StatBlockSection[];
  reactions: StatBlockSection[];
  notes?: string[];
  sourceAttribution: SourceAttribution;
};

export type SummonSourceKey =
  | "Wild Companion"
  | "Conjure Animals"
  | "Faithful Summons"
  | "Conjure Woodland Beings"
  | "Conjure Minor Elementals"
  | "Conjure Elemental"
  | "Conjure Fey"
  | "Giant Insect"
  | "Summon Beast"
  | "Summon Fey"
  | "Summon Elemental"
  | "Summon Draconic Spirit";

export type GeneratedSummonKey =
  | "summon-beast"
  | "summon-fey"
  | "summon-elemental"
  | "summon-draconic-spirit";

export type SummonableKind = "existing-creature" | "generated";

export type SummonScalingInput = {
  slotLevel: number;
  spellAttackBonus: number;
  spellSaveDC: number;
};

export type SummonableData = {
  summonableKind: SummonableKind;
  summonSources: SummonSourceKey[];
  statBlock: StatBlock;
  generatedBySpell?: {
    name: string;
    slug: string;
    minimumSlotLevel: number;
  };
  generationKey?: GeneratedSummonKey;
};

export type CatalogData =
  | ClassData
  | SubclassData
  | SpellData
  | FeatData
  | BackgroundData
  | LineageData
  | EquipmentData
  | BeastData
  | CreatureData
  | SummonableData;

export type CatalogEntry<T = CatalogData> = {
  kind: CatalogKind;
  slug: string;
  name: string;
  sourcePageSlug?: string;
  source: SourceAttribution;
  searchText: string;
  data: T;
};

export type CharacterSettings = {
  featsEnabled: boolean;
  tashaOptionalDruidFeatures: boolean;
};

export type CharacterSelectionPayload =
  | { value: string }
  | { values: string[] }
  | { increases: Partial<Record<Ability, number>> }
  | Record<string, unknown>;

export type CharacterRecord = {
  id: string;
  name: string;
  level: number;
  classSlug: string;
  subclassSlug: string;
  lineageSlug?: string | null;
  lineageVariantSlug?: string | null;
  backgroundSlug?: string | null;
  abilityScores: AbilityScores;
  settings: CharacterSettings;
  createdAt: string;
  updatedAt: string;
};

export type CharacterSelectionRecord = {
  id: string;
  characterId: string;
  key: string;
  level: number;
  kind: string;
  payload: CharacterSelectionPayload;
};

export type PendingChoice = ChoiceDefinition & {
  sourceKind: CatalogKind | "system";
  sourceSlug: string;
  currentValue?: CharacterSelectionPayload | null;
};

export type SheetSectionFeature = {
  name: string;
  description: string;
  sourceLabel: string;
  level?: number;
};

export type CharacterSheet = {
  character: CharacterRecord;
  abilityScores: AbilityScores;
  modifiers: AbilityScores;
  proficiencyBonus: number;
  initiative: number;
  passivePerception: number;
  estimatedHitPoints: number;
  spellAttackModifier: number;
  preparedSpellCapacity: number;
  cantripsKnown: number;
  spellSlots: number[];
  walkSpeed: number;
  darkvision?: number;
  proficiencies: {
    skills: string[];
    tools: string[];
    weapons: string[];
    armor: string[];
    languages: string[];
    saves: string[];
  };
  traits: SheetSectionFeature[];
  feats: CatalogEntry<FeatData>[];
  selectedSpells: CatalogEntry<SpellData>[];
};

export type CurrentSummonRecord = {
  id: string;
  characterId: string;
  creatureSlug: string;
  nickname: string;
  currentHitPoints: number;
  maxHitPoints: number;
  createdAt: string;
  updatedAt: string;
};

export type CurrentSummon = CurrentSummonRecord & {
  creature: CatalogEntry<CreatureData>;
};

export type BoardEntryRecord = {
  id: string;
  summonableSlug: string;
  nickname: string;
  currentHitPoints: number;
  maxHitPoints: number;
  statBlockSnapshot: StatBlock;
  createdAt: string;
  updatedAt: string;
};

export type BoardEntry = BoardEntryRecord & {
  summonable?: CatalogEntry<SummonableData> | null;
};
