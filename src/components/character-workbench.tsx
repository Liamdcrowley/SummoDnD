"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  ABILITY_LABELS,
  DRUID_WILD_SHAPE_PROGRESSION,
  LEVEL_LABELS,
} from "@/lib/constants";
import { abilityModifierLabel, spellSaveDc } from "@/lib/rules";
import type {
  Ability,
  CatalogEntry,
  CharacterSheet,
  CreatureData,
  CurrentSummon,
  PendingChoice,
  SpellData,
} from "@/lib/types";

type CharacterWorkbenchProps = {
  sheet: CharacterSheet;
  pendingChoices: PendingChoice[];
  spells: CatalogEntry<SpellData>[];
  currentSummons: CurrentSummon[];
  summonCatalog: CatalogEntry<CreatureData>[];
};

const tabs = ["Sheet", "Spells", "Summons"] as const;

const skillAbilityMap: Array<{ skill: string; ability: Ability }> = [
  { skill: "Acrobatics", ability: "dex" },
  { skill: "Animal Handling", ability: "wis" },
  { skill: "Arcana", ability: "int" },
  { skill: "Athletics", ability: "str" },
  { skill: "Deception", ability: "cha" },
  { skill: "History", ability: "int" },
  { skill: "Insight", ability: "wis" },
  { skill: "Intimidation", ability: "cha" },
  { skill: "Investigation", ability: "int" },
  { skill: "Medicine", ability: "wis" },
  { skill: "Nature", ability: "int" },
  { skill: "Perception", ability: "wis" },
  { skill: "Performance", ability: "cha" },
  { skill: "Persuasion", ability: "cha" },
  { skill: "Religion", ability: "int" },
  { skill: "Sleight of Hand", ability: "dex" },
  { skill: "Stealth", ability: "dex" },
  { skill: "Survival", ability: "wis" },
];

function modifierLabel(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function spellLevelLabel(level: number) {
  if (level === 0) {
    return "Cantrip";
  }

  if (level === 1) {
    return "1st";
  }

  if (level === 2) {
    return "2nd";
  }

  if (level === 3) {
    return "3rd";
  }

  return `${level}th`;
}

function humanizeSlug(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSpeed(speed: Record<string, string>) {
  return Object.entries(speed)
    .map(([mode, value]) => `${mode} ${value}`)
    .join(", ");
}

function matchesSpellQuery(spell: CatalogEntry<SpellData>, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    spell.name,
    spell.data.school,
    spellLevelLabel(spell.data.level),
    spell.data.description.join(" "),
    spell.data.castingTime,
    spell.data.range,
    spell.data.duration,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesCreatureQuery(creature: CatalogEntry<CreatureData>, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    creature.name,
    creature.data.type,
    creature.data.size,
    creature.data.challengeRating,
    creature.data.summonTags.join(" "),
    creature.data.actions.map((action) => action.name).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function choiceKind(choice: PendingChoice, payload: unknown) {
  if (choice.id.includes("cantrips")) {
    return "cantrip";
  }
  if (choice.id.includes("class-skills")) {
    return "skill";
  }
  if (choice.id.includes("equipment")) {
    return "equipment";
  }
  if (choice.id.includes("feat-mode")) {
    return "mode";
  }
  if (choice.id.includes("feat:")) {
    return "feat";
  }
  if (
    choice.id.includes("asi") ||
    (typeof payload === "object" && payload !== null && "increases" in payload)
  ) {
    return "asi";
  }
  return "choice";
}

function groupSpells(spells: CatalogEntry<SpellData>[]) {
  return spells.reduce<Record<number, CatalogEntry<SpellData>[]>>((groups, spell) => {
    groups[spell.data.level] = [...(groups[spell.data.level] ?? []), spell];
    return groups;
  }, {});
}

function wildShapeSummary(level: number) {
  const progression =
    [...DRUID_WILD_SHAPE_PROGRESSION]
      .reverse()
      .find((entry) => level >= entry.level) ?? DRUID_WILD_SHAPE_PROGRESSION[0];

  return {
    uses: progression.uses,
    maxCr: progression.maxCr,
    canSwim: progression.canSwim,
    canFly: progression.canFly,
  };
}

function PendingChoiceForm({
  choice,
  onSubmit,
}: {
  choice: PendingChoice;
  onSubmit: (choice: PendingChoice, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [singleValue, setSingleValue] = useState(choice.options?.[0]?.value ?? "");
  const [manyValues, setManyValues] = useState<string[]>([]);
  const [abilityIncreases, setAbilityIncreases] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const allowedAbilities = String(choice.metadata?.abilities ?? "str,dex,con,int,wis,cha")
    .split(",")
    .filter(Boolean);
  const totalPoints = Number(choice.metadata?.amount ?? choice.maxSelections ?? 1);

  function toggleManyValue(value: string) {
    setManyValues((current) =>
      current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (choice.type === "one-of") {
      if (!singleValue) {
        setLocalError("Choose an option first.");
        return;
      }
      await onSubmit(choice, { value: singleValue });
      return;
    }

    if (choice.type === "many-of") {
      if (manyValues.length !== choice.maxSelections) {
        setLocalError(`Choose exactly ${choice.maxSelections} options.`);
        return;
      }
      await onSubmit(choice, { values: manyValues });
      return;
    }

    if (choice.type === "ability-split") {
      const spent = Object.values(abilityIncreases).reduce((sum, value) => sum + value, 0);
      if (spent !== totalPoints) {
        setLocalError(`Spend exactly ${totalPoints} point${totalPoints === 1 ? "" : "s"}.`);
        return;
      }
      await onSubmit(choice, { increases: abilityIncreases });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
          Level {choice.minLevel}
        </p>
        <h4 className="font-display text-2xl text-[var(--ink)]">{choice.label}</h4>
        {choice.description ? (
          <p className="text-sm leading-7 text-[var(--muted)]">{choice.description}</p>
        ) : null}
      </div>

      {choice.type === "one-of" ? (
        <select
          value={singleValue}
          onChange={(event) => setSingleValue(event.target.value)}
          className="mt-4 w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--moss)]"
        >
          {choice.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {choice.type === "many-of" ? (
        <div className="mt-4 grid gap-3">
          {choice.options?.map((option) => (
            <label
              key={option.value}
              className="flex gap-3 rounded-2xl border border-[var(--line)] bg-white p-3"
            >
              <input
                type="checkbox"
                checked={manyValues.includes(option.value)}
                onChange={() => toggleManyValue(option.value)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="text-xs text-[var(--muted)]">{option.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {choice.type === "ability-split" ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {allowedAbilities.map((ability) => (
            <label
              key={ability}
              className="rounded-2xl border border-[var(--line)] bg-white p-3"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                {ABILITY_LABELS[ability as Ability]}
              </span>
              <input
                type="number"
                min={0}
                max={totalPoints}
                value={abilityIncreases[ability] ?? 0}
                onChange={(event) =>
                  setAbilityIncreases((current) => ({
                    ...current,
                    [ability]: Number(event.target.value),
                  }))
                }
                className="mt-2 w-full bg-transparent text-3xl font-semibold text-[var(--ink)] outline-none"
              />
            </label>
          ))}
        </div>
      ) : null}

      {localError ? <p className="mt-4 text-sm text-[var(--danger)]">{localError}</p> : null}

      <button
        type="submit"
        className="mt-4 rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--moss-dark)]"
      >
        Save
      </button>
    </form>
  );
}

function CurrentSummonCard({
  summon,
  disabled,
  onSave,
  onRemove,
}: {
  summon: CurrentSummon;
  disabled: boolean;
  onSave: (summonId: string, values: { nickname: string; currentHitPoints: number; maxHitPoints: number }) => void;
  onRemove: (summonId: string) => void;
}) {
  const [nickname, setNickname] = useState(summon.nickname);
  const [currentHitPoints, setCurrentHitPoints] = useState(String(summon.currentHitPoints));
  const [maxHitPoints, setMaxHitPoints] = useState(String(summon.maxHitPoints));

  function adjustHitPoints(amount: number) {
    const maxValue = Math.max(1, Number(maxHitPoints) || summon.maxHitPoints);
    const currentValue = Math.max(0, Number(currentHitPoints) || 0);
    const nextValue = Math.min(maxValue, Math.max(0, currentValue + amount));
    setCurrentHitPoints(String(nextValue));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(summon.id, {
      nickname,
      currentHitPoints: Number(currentHitPoints) || 0,
      maxHitPoints: Math.max(1, Number(maxHitPoints) || summon.maxHitPoints),
    });
  }

  return (
    <details className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl text-[var(--ink)]">{summon.nickname}</h3>
            <p className="text-sm text-[var(--muted)]">
              {summon.creature.name} / {summon.creature.data.type} / CR {summon.creature.data.challengeRating}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              HP
            </p>
            <p className="text-2xl font-semibold text-[var(--ink)]">
              {summon.currentHitPoints} / {summon.maxHitPoints}
            </p>
          </div>
        </div>
      </summary>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              Nickname
            </span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)]"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              Current HP
            </span>
            <input
              type="number"
              min={0}
              value={currentHitPoints}
              onChange={(event) => setCurrentHitPoints(event.target.value)}
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)]"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              Max HP
            </span>
            <input
              type="number"
              min={1}
              value={maxHitPoints}
              onChange={(event) => setMaxHitPoints(event.target.value)}
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)]"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {[-5, -1, 1, 5].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => adjustHitPoints(amount)}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-sm font-semibold text-[var(--ink)]"
            >
              {amount > 0 ? `+${amount}` : amount}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">AC</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
              {summon.creature.data.armorClass}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Size</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
              {summon.creature.data.size}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Type</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
              {summon.creature.data.type}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">CR</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">
              {summon.creature.data.challengeRating}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Abilities
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-[var(--ink)]">
                {Object.entries(summon.creature.data.abilities).map(([ability, score]) => (
                  <div key={ability}>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {ABILITY_LABELS[ability as Ability].slice(0, 3)}
                    </p>
                    <p className="font-semibold">
                      {score} ({abilityModifierLabel(score)})
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--ink)]">
              <p>
                <span className="font-semibold">Speed:</span> {formatSpeed(summon.creature.data.speed)}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Senses:</span>{" "}
                {summon.creature.data.senses.join(", ") || "None listed"}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Languages:</span> {summon.creature.data.languages || "None"}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {summon.creature.data.traits.length > 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                  Traits
                </p>
                <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--ink)]">
                  {summon.creature.data.traits.map((trait) => (
                    <div key={trait.name}>
                      <p className="font-semibold">{trait.name}</p>
                      <p className="text-[var(--muted)]">{trait.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summon.creature.data.actions.length > 0 ? (
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                  Actions
                </p>
                <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--ink)]">
                  {summon.creature.data.actions.map((action) => (
                    <div key={action.name}>
                      <p className="font-semibold">{action.name}</p>
                      <p className="text-[var(--muted)]">{action.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save summon
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(summon.id)}
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      </form>
    </details>
  );
}

export function CharacterWorkbench({
  sheet,
  pendingChoices,
  spells,
  currentSummons,
  summonCatalog,
}: CharacterWorkbenchProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Sheet");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [preparedSpellSlugs, setPreparedSpellSlugs] = useState<string[]>(
    sheet.selectedSpells.filter((spell) => spell.data.level > 0).map((spell) => spell.slug),
  );
  const [spellQuery, setSpellQuery] = useState("");
  const [summonQuery, setSummonQuery] = useState("");
  const deferredSpellQuery = useDeferredValue(spellQuery.trim().toLowerCase());
  const deferredSummonQuery = useDeferredValue(summonQuery.trim().toLowerCase());

  const knownSpellSlugs = new Set(sheet.selectedSpells.map((spell) => spell.slug));
  const spellGroups = groupSpells(
    spells.filter((spell) => matchesSpellQuery(spell, deferredSpellQuery)),
  );
  const filteredSummonCatalog = summonCatalog.filter((creature) =>
    matchesCreatureQuery(creature, deferredSummonQuery),
  );
  const spellPreparationLimitReached =
    preparedSpellSlugs.length >= sheet.preparedSpellCapacity;
  const knownCantrips = sheet.selectedSpells.filter((spell) => spell.data.level === 0);
  const wildShape = wildShapeSummary(sheet.character.level);

  const savingThrowRows = (Object.keys(ABILITY_LABELS) as Ability[]).map((ability) => ({
    ability,
    proficient: sheet.proficiencies.saves.includes(ABILITY_LABELS[ability]),
    modifier:
      sheet.modifiers[ability] +
      (sheet.proficiencies.saves.includes(ABILITY_LABELS[ability]) ? sheet.proficiencyBonus : 0),
  }));

  const skillRows = skillAbilityMap.map(({ skill, ability }) => ({
    skill,
    proficient: sheet.proficiencies.skills.includes(skill),
    modifier:
      sheet.modifiers[ability] +
      (sheet.proficiencies.skills.includes(skill) ? sheet.proficiencyBonus : 0),
  }));

  function commit(request: Promise<Response>, successMessage: string) {
    setStatus(null);
    startTransition(async () => {
      try {
        const response = await request;
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setStatus(data.error ?? "Request failed.");
          return;
        }
        setStatus(successMessage);
        router.refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Request failed.");
      }
    });
  }

  async function handleChoiceSubmit(choice: PendingChoice, payload: Record<string, unknown>) {
    if (choice.id === "system:lineage-variant" && "value" in payload) {
      commit(
        fetch(`/api/characters/${sheet.character.id}/selections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "set-profile",
            lineageVariantSlug: payload.value,
          }),
        }),
        "Character setup updated.",
      );
      return;
    }

    commit(
      fetch(`/api/characters/${sheet.character.id}/selections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-selection",
          key: choice.id,
          level: choice.minLevel,
          kind: choiceKind(choice, payload),
          payload,
        }),
      }),
      "Choice saved.",
    );
  }

  function handleLevelChange(nextLevel: number) {
    commit(
      fetch(`/api/characters/${sheet.character.id}/selections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "set-level",
          level: nextLevel,
        }),
      }),
      `Level set to ${nextLevel}.`,
    );
  }

  function togglePreparedSpell(spell: CatalogEntry<SpellData>) {
    if (spell.data.level === 0) {
      return;
    }

    setPreparedSpellSlugs((current) => {
      if (current.includes(spell.slug)) {
        return current.filter((entry) => entry !== spell.slug);
      }

      if (current.length >= sheet.preparedSpellCapacity) {
        setStatus(`You can only prepare ${sheet.preparedSpellCapacity} spells.`);
        return current;
      }

      return [...current, spell.slug];
    });
  }

  function savePreparedSpells() {
    commit(
      fetch(`/api/characters/${sheet.character.id}/prepared-spells`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spellSlugs: preparedSpellSlugs,
        }),
      }),
      "Prepared spells updated.",
    );
  }

  function handleAddSummon(creatureSlug: string) {
    commit(
      fetch(`/api/characters/${sheet.character.id}/summons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          creatureSlug,
        }),
      }),
      "Summon added.",
    );
  }

  function handleSaveSummon(
    summonId: string,
    values: { nickname: string; currentHitPoints: number; maxHitPoints: number },
  ) {
    commit(
      fetch(`/api/characters/${sheet.character.id}/summons`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summonId,
          ...values,
        }),
      }),
      "Summon updated.",
    );
  }

  function handleRemoveSummon(summonId: string) {
    commit(
      fetch(`/api/characters/${sheet.character.id}/summons`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summonId,
        }),
      }),
      "Summon removed.",
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_25px_80px_rgba(62,44,26,0.12)] sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Link
                href="/"
                className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]"
              >
                Back to roster
              </Link>
              <div>
                <h1 className="font-display text-4xl text-[var(--ink)] sm:text-5xl">
                  {sheet.character.name}
                </h1>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  Druid / Circle of the Shepherd / {humanizeSlug(sheet.character.backgroundSlug)} /
                  {" "}
                  {humanizeSlug(sheet.character.lineageSlug)}
                </p>
              </div>
            </div>

            <label className="flex min-w-[8.5rem] flex-col gap-2 rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-3">
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Level
              </span>
              <select
                value={sheet.character.level}
                onChange={(event) => handleLevelChange(Number(event.target.value))}
                disabled={isPending}
                className="bg-transparent text-lg font-semibold text-[var(--ink)] outline-none"
              >
                {LEVEL_LABELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab
                    ? "bg-[var(--moss)] text-[var(--paper)]"
                    : "border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Prepared
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {preparedSpellSlugs.length} / {sheet.preparedSpellCapacity}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Current summons
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {currentSummons.length}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Setup items
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {pendingChoices.length}
              </p>
            </div>
          </div>

          {status ? <p className="text-sm text-[var(--muted)]">{status}</p> : null}
        </div>
      </header>

      {activeTab === "Sheet" ? (
        <section className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Estimated HP
              </p>
              <p className="mt-3 font-display text-4xl text-[var(--ink)]">
                {sheet.estimatedHitPoints}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Based on average rolls and current Constitution.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Initiative
              </p>
              <p className="mt-3 font-display text-4xl text-[var(--ink)]">
                {modifierLabel(sheet.initiative)}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Passive Perception {sheet.passivePerception}
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Spellcasting
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--ink)]">
                DC {spellSaveDc(sheet.character.level, sheet.modifiers.wis)}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Spell attack {modifierLabel(sheet.spellAttackModifier)}
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Movement
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--ink)]">
                {sheet.walkSpeed} ft
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Darkvision {sheet.darkvision ? `${sheet.darkvision} ft` : "None"}
              </p>
            </article>
          </section>

          <section className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(sheet.abilityScores).map(([ability, score]) => (
              <article
                key={ability}
                className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_18px_60px_rgba(62,44,26,0.08)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                  {ABILITY_LABELS[ability as Ability].slice(0, 3)}
                </p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <span className="font-display text-4xl text-[var(--ink)]">{score}</span>
                  <span className="text-lg font-semibold text-[var(--moss-dark)]">
                    {abilityModifierLabel(score)}
                  </span>
                </div>
              </article>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Spell slots and druid tools</h2>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-[var(--ink)] sm:grid-cols-5">
                {sheet.spellSlots.map((count, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {index + 1}
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{count}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2 text-sm text-[var(--ink)]">
                <p>Cantrips known: {sheet.cantripsKnown}</p>
                <p>Prepared spell capacity: {sheet.preparedSpellCapacity}</p>
                <p>
                  Wild Shape uses: {wildShape.uses} per short rest, max CR {wildShape.maxCr},
                  swim {wildShape.canSwim ? "yes" : "no"}, fly {wildShape.canFly ? "yes" : "no"}
                </p>
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Identity</h2>
              <div className="mt-4 space-y-3 text-sm text-[var(--ink)]">
                <p>Class: Druid</p>
                <p>Circle: Circle of the Shepherd</p>
                <p>Background: {humanizeSlug(sheet.character.backgroundSlug)}</p>
                <p>Lineage: {humanizeSlug(sheet.character.lineageSlug)}</p>
                <p>Variant: {humanizeSlug(sheet.character.lineageVariantSlug)}</p>
                <p>Proficiency bonus: {modifierLabel(sheet.proficiencyBonus)}</p>
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Saving throws</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {savingThrowRows.map((row) => (
                  <div
                    key={row.ability}
                    className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)]"
                  >
                    <span>
                      {ABILITY_LABELS[row.ability]}
                      {row.proficient ? " *" : ""}
                    </span>
                    <span className="font-semibold">{modifierLabel(row.modifier)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Proficiencies</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-[var(--ink)]">
                <p>Skills: {sheet.proficiencies.skills.join(", ") || "None yet"}</p>
                <p>Languages: {sheet.proficiencies.languages.join(", ") || "None listed"}</p>
                <p>Weapons: {sheet.proficiencies.weapons.join(", ") || "None listed"}</p>
                <p>Armor: {sheet.proficiencies.armor.join(", ") || "None listed"}</p>
                <p>Tools: {sheet.proficiencies.tools.join(", ") || "None listed"}</p>
              </div>
            </article>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-[var(--ink)]">Skills</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Asterisks mark proficiency.
                </p>
              </div>
              <div className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                Passive Perception {sheet.passivePerception}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {skillRows.map((row) => (
                <div
                  key={row.skill}
                  className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)]"
                >
                  <span>
                    {row.skill}
                    {row.proficient ? " *" : ""}
                  </span>
                  <span className="font-semibold">{modifierLabel(row.modifier)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Known cantrips</h2>
              <div className="mt-4 space-y-3">
                {knownCantrips.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    No cantrips recorded yet. Use the setup section below if this character still
                    needs build choices.
                  </p>
                ) : (
                  knownCantrips.map((spell) => (
                    <div
                      key={spell.slug}
                      className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3"
                    >
                      <p className="font-semibold text-[var(--ink)]">{spell.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {spell.data.school} cantrip
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <h2 className="font-display text-2xl text-[var(--ink)]">Features</h2>
              <div className="mt-4 space-y-3">
                {sheet.traits.map((trait) => (
                  <details
                    key={`${trait.name}-${trait.sourceLabel}`}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4"
                  >
                    <summary className="cursor-pointer list-none">
                      <p className="font-semibold text-[var(--ink)]">{trait.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        {trait.sourceLabel}
                      </p>
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                      {trait.description}
                    </p>
                  </details>
                ))}
                {sheet.feats.length > 0 ? (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
                    <p className="font-semibold text-[var(--ink)]">Feats</p>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {sheet.feats.map((feat) => feat.name).join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </article>
          </section>

          <details className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <summary className="cursor-pointer list-none">
              <h2 className="font-display text-2xl text-[var(--ink)]">
                Finish build details ({pendingChoices.length})
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                This keeps the sheet usable first, while still letting you fill in cantrips, feats,
                skills, and other unresolved character choices.
              </p>
            </summary>
            <div className="mt-5 grid gap-4">
              {pendingChoices.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No unresolved build choices right now.
                </p>
              ) : (
                pendingChoices.map((choice) => (
                  <PendingChoiceForm
                    key={choice.id}
                    choice={choice}
                    onSubmit={handleChoiceSubmit}
                  />
                ))
              )}
            </div>
          </details>
        </section>
      ) : null}

      {activeTab === "Spells" ? (
        <section className="space-y-6">
          <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-2xl text-[var(--ink)]">Druid spell list</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Browse the full druid list, prepare leveled spells, and open any spell card for
                    its rules text.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={savePreparedSpells}
                  disabled={isPending}
                  className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save prepared spells
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <input
                  value={spellQuery}
                  onChange={(event) => setSpellQuery(event.target.value)}
                  placeholder="Search by name, school, range, or text"
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)]"
                />
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                  Prepared {preparedSpellSlugs.length} / {sheet.preparedSpellCapacity}
                </div>
              </div>
            </div>
          </article>

          {Object.entries(spellGroups)
            .sort(([left], [right]) => Number(left) - Number(right))
            .map(([level, entries]) => (
              <section
                key={level}
                className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5"
              >
                <h3 className="font-display text-2xl text-[var(--ink)]">
                  {spellLevelLabel(Number(level))} spells
                </h3>
                <div className="mt-4 space-y-3">
                  {entries.map((spell) => {
                    const isPrepared = preparedSpellSlugs.includes(spell.slug);
                    const isKnownCantrip = spell.data.level === 0 && knownSpellSlugs.has(spell.slug);

                    return (
                      <details
                        key={spell.slug}
                        className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4"
                      >
                        <summary className="cursor-pointer list-none">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold text-[var(--ink)]">{spell.name}</p>
                              <p className="mt-1 text-sm text-[var(--muted)]">
                                {spell.data.school} / {spell.data.castingTime} / {spell.data.range}
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              {isKnownCantrip ? (
                                <span className="rounded-full bg-[var(--moss)] px-3 py-1 text-xs font-semibold text-[var(--paper)]">
                                  Known
                                </span>
                              ) : null}
                              {isPrepared ? (
                                <span className="rounded-full bg-[var(--clay)] px-3 py-1 text-xs font-semibold text-white">
                                  Prepared
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </summary>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                          <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--ink)]">
                            <p>
                              <span className="font-semibold">Level:</span>{" "}
                              {spellLevelLabel(spell.data.level)}
                            </p>
                            <p>
                              <span className="font-semibold">School:</span> {spell.data.school}
                            </p>
                            <p>
                              <span className="font-semibold">Casting time:</span>{" "}
                              {spell.data.castingTime}
                            </p>
                            <p>
                              <span className="font-semibold">Range:</span> {spell.data.range}
                            </p>
                            <p>
                              <span className="font-semibold">Components:</span>{" "}
                              {spell.data.components}
                            </p>
                            <p>
                              <span className="font-semibold">Duration:</span> {spell.data.duration}
                            </p>
                            <a
                              href={spell.source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-sm font-semibold text-[var(--moss-dark)]"
                            >
                              Open source page
                            </a>
                          </div>

                          <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4">
                            {spell.data.description.map((line, index) => (
                              <p
                                key={index}
                                className="text-sm leading-7 text-[var(--muted)]"
                              >
                                {line}
                              </p>
                            ))}
                            {spell.data.higherLevel ? (
                              <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                                  At Higher Levels
                                </p>
                                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                                  {spell.data.higherLevel}
                                </p>
                              </div>
                            ) : null}

                            {spell.data.level > 0 ? (
                              <button
                                type="button"
                                onClick={() => togglePreparedSpell(spell)}
                                disabled={
                                  isPending ||
                                  (!isPrepared && spellPreparationLimitReached)
                                }
                                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                                  isPrepared
                                    ? "bg-[var(--clay)] text-white"
                                    : "border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)]"
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                              >
                                {isPrepared ? "Remove from prepared" : "Prepare spell"}
                              </button>
                            ) : (
                              <p className="text-sm text-[var(--muted)]">
                                Cantrips are tracked through build choices, not prepared daily.
                              </p>
                            )}
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            ))}
        </section>
      ) : null}

      {activeTab === "Summons" ? (
        <section className="space-y-6">
          <article className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <h2 className="font-display text-2xl text-[var(--ink)]">Summoning notes</h2>
            <div className="mt-4 space-y-2 text-sm leading-7 text-[var(--ink)]">
              <p>Use this tab as a live board for beasts, fey, and elementals you have on the field.</p>
              {sheet.character.level >= 6 ? (
                <p>Mighty Summoner reminder: summoned beasts and fey gain 2 HP per Hit Die, and their natural attacks count as magical.</p>
              ) : null}
              {sheet.character.level >= 10 ? (
                <p>Guardian Spirit reminder: your Spirit Totem can heal summoned beasts and fey for half your druid level at the end of their turns.</p>
              ) : null}
              {sheet.character.level >= 14 ? (
                <p>Faithful Summons reminder: when you drop unconscious, Conjure Animals can trigger automatically.</p>
              ) : null}
            </div>
          </article>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-[var(--ink)]">Current summons</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Track HP, rename creatures, and open each card for its stat block.
                </p>
              </div>
              <div className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                {currentSummons.length} active
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {currentSummons.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No active summons yet. Add one from the catalog below.
                </p>
              ) : (
                currentSummons.map((summon) => (
                  <CurrentSummonCard
                    key={summon.id}
                    summon={summon}
                    disabled={isPending}
                    onSave={handleSaveSummon}
                    onRemove={handleRemoveSummon}
                  />
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-2xl text-[var(--ink)]">Summon catalog</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Search beast, fey, and elemental stat blocks and add any of them to your current
                  summon list.
                </p>
              </div>
              <input
                value={summonQuery}
                onChange={(event) => setSummonQuery(event.target.value)}
                placeholder="Search summons"
                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)] sm:max-w-sm"
              />
            </div>

            <div className="mt-4 space-y-3">
              {filteredSummonCatalog.map((creature) => (
                <details
                  key={creature.slug}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{creature.name}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {creature.data.type} / {creature.data.size} / CR {creature.data.challengeRating}
                        </p>
                      </div>
                      <div className="text-right text-sm text-[var(--muted)]">
                        <p>AC {creature.data.armorClass}</p>
                        <p>{creature.data.hitPoints}</p>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--ink)]">
                      <p>
                        <span className="font-semibold">Summon tags:</span>{" "}
                        {creature.data.summonTags.join(", ")}
                      </p>
                      <p>
                        <span className="font-semibold">Speed:</span> {formatSpeed(creature.data.speed)}
                      </p>
                      <p>
                        <span className="font-semibold">Senses:</span>{" "}
                        {creature.data.senses.join(", ") || "None listed"}
                      </p>
                      <p>
                        <span className="font-semibold">Languages:</span> {creature.data.languages || "None"}
                      </p>
                      <a
                        href={creature.source.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-sm font-semibold text-[var(--moss-dark)]"
                      >
                        Open source page
                      </a>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                          Abilities
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-[var(--ink)]">
                          {Object.entries(creature.data.abilities).map(([ability, score]) => (
                            <div key={ability}>
                              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                                {ABILITY_LABELS[ability as Ability].slice(0, 3)}
                              </p>
                              <p className="font-semibold">
                                {score} ({abilityModifierLabel(score)})
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {creature.data.traits.length > 0 ? (
                        <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                            Traits
                          </p>
                          <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--ink)]">
                            {creature.data.traits.map((trait) => (
                              <div key={trait.name}>
                                <p className="font-semibold">{trait.name}</p>
                                <p className="text-[var(--muted)]">{trait.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {creature.data.actions.length > 0 ? (
                        <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                            Actions
                          </p>
                          <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--ink)]">
                            {creature.data.actions.map((action) => (
                              <div key={action.name}>
                                <p className="font-semibold">{action.name}</p>
                                <p className="text-[var(--muted)]">{action.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddSummon(creature.slug)}
                    disabled={isPending}
                    className="mt-4 rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Add to current summons
                  </button>
                </details>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
