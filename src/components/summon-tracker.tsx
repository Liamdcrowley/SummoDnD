"use client";

import { useDeferredValue, useEffect, useState } from "react";

import {
  createBoardEntry,
  loadBoardEntries,
  removeBoardEntry,
  replaceBoardEntries,
  subscribeBoardEntries,
  updateBoardEntry,
} from "@/lib/board-state";
import {
  extractAttackActions,
  extractFollowUpActions,
  formatAttackRoutine,
  rollAttackAction,
  type AttackAction,
  type AttackRollResult,
} from "@/lib/combat-rolls";
import type { BoardEntry, CatalogEntry, StatBlock, StatBlockSection, SummonableData } from "@/lib/types";

type SummonTrackerProps = {
  initialSummonables: CatalogEntry<SummonableData>[];
};

type TabKey = "library" | "board";

const STATS_MODAL_HISTORY_KEY = "summodndStatsModal";

type StatBlockModalState =
  | {
      title: string;
      subtitle: string;
      statBlock: StatBlock;
      sourceTags: string[];
      showSourceAttribution: boolean;
    }
  | null;

function formatStatList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None";
}

function formatSpeed(speed: Record<string, string>) {
  return Object.entries(speed)
    .map(([mode, value]) => `${mode}: ${value}`)
    .join(", ");
}

function formatCr(label: string) {
  return label === "--" ? "Variable" : `CR ${label}`;
}

function parseCrValue(label: string) {
  if (label === "--") {
    return null;
  }

  if (label.includes("/")) {
    const [numerator, denominator] = label.split("/").map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  const value = Number(label);
  return Number.isFinite(value) ? value : null;
}

function summonableCrValue(entry: CatalogEntry<SummonableData>) {
  return entry.data.statBlock.challengeRatingValue ?? parseCrValue(entry.data.statBlock.challengeRating);
}

function CompactDetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{value}</p>
    </div>
  );
}

function compactArmorClassSize(value: string) {
  if (value.length > 18) {
    return "text-[0.68rem]";
  }

  if (value.length > 12) {
    return "text-xs";
  }

  if (value.length > 6) {
    return "text-sm";
  }

  return "text-lg";
}

function formatDamageRoll(result: AttackRollResult) {
  const damageLabel = result.critical ? "Crit damage" : "Damage";

  if (result.damageParts.length <= 1) {
    return `${damageLabel} ${result.damageTotal}`;
  }

  const parts = result.damageParts
    .map((part) => `${part.total}${part.type ? ` ${part.type}` : ""}`)
    .join(" + ");

  return `${damageLabel} ${parts} (${result.damageTotal})`;
}

function attackButtonClassName(result?: AttackRollResult) {
  const baseClassName = "rounded-full px-3 py-2 text-sm font-semibold";

  if (result?.critical) {
    return `${baseClassName} border border-[var(--danger)] bg-[var(--danger)] text-[var(--paper)] shadow-[0_0_0_3px_rgba(156,61,53,0.18)]`;
  }

  return `${baseClassName} border border-[var(--line)] bg-[rgba(255,255,255,0.45)] text-[var(--ink)]`;
}

function FilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full bg-transparent text-sm text-[var(--ink)] outline-none"
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionBlock({
  title,
  sections,
}: {
  title: string;
  sections: StatBlockSection[];
}) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
        {title}
      </h4>
      <div className="mt-4 space-y-4">
        {sections.map((section) => (
          <div key={`${title}-${section.name}`} className="space-y-2">
            <p className="font-semibold text-[var(--ink)]">{section.name}</p>
            <div className="space-y-2 text-sm leading-7 text-[var(--ink)]">
              {section.entries.map((entry, index) => (
                <p key={`${section.name}-${index}`}>{entry}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AbilityGrid({ statBlock }: { statBlock: StatBlock }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {Object.entries(statBlock.abilities).map(([ability, score]) => {
        const modifier = Math.floor((score - 10) / 2);
        return (
          <div
            key={ability}
            className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-3 py-4 text-center"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              {ability}
            </p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{score}</p>
            <p className="text-sm text-[var(--muted)]">
              {modifier >= 0 ? "+" : ""}
              {modifier}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function StatBlockSheet({
  title,
  subtitle,
  statBlock,
  sourceTags,
  showSourceAttribution,
  onClose,
}: {
  title: string;
  subtitle: string;
  statBlock: StatBlock;
  sourceTags: string[];
  showSourceAttribution: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(25,18,12,0.56)] px-3 py-4 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--card)] shadow-[0_30px_100px_rgba(36,23,13,0.28)]">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
              {subtitle}
            </p>
            <h3 className="mt-2 font-display text-3xl text-[var(--ink)]">{title}</h3>
            {sourceTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-xs text-[var(--ink)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
              <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <CompactDetailItem label="Size" value={statBlock.size} />
                <CompactDetailItem label="Type" value={statBlock.type} />
                <CompactDetailItem label="Alignment" value={statBlock.alignment} />
                <CompactDetailItem label="Armor Class" value={statBlock.armorClass} />
                <CompactDetailItem label="Hit Points" value={statBlock.hitPoints} />
                <CompactDetailItem label="Speed" value={formatSpeed(statBlock.speed)} />
                <CompactDetailItem
                  label="Saving Throws"
                  value={formatStatList(statBlock.savingThrows)}
                />
                <CompactDetailItem label="Skills" value={formatStatList(statBlock.skills)} />
                <CompactDetailItem label="Challenge" value={formatCr(statBlock.challengeRating)} />
                <CompactDetailItem label="Senses" value={formatStatList(statBlock.senses)} />
                <CompactDetailItem label="Languages" value={formatStatList(statBlock.languages)} />
                <CompactDetailItem
                  label="Damage Resistances"
                  value={formatStatList(statBlock.damageResistances)}
                />
                <CompactDetailItem
                  label="Damage Immunities"
                  value={formatStatList(statBlock.damageImmunities)}
                />
                <CompactDetailItem
                  label="Damage Vulnerabilities"
                  value={formatStatList(statBlock.damageVulnerabilities)}
                />
                <CompactDetailItem
                  label="Condition Immunities"
                  value={formatStatList(statBlock.conditionImmunities)}
                />
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
                Ability Scores
              </h4>
              <div className="mt-4">
                <AbilityGrid statBlock={statBlock} />
              </div>
            </section>

            {statBlock.notes && statBlock.notes.length > 0 ? (
              <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
                  Notes
                </h4>
                <div className="mt-3 space-y-2 text-sm leading-7 text-[var(--ink)]">
                  {statBlock.notes.map((entry) => (
                    <p key={entry}>{entry}</p>
                  ))}
                </div>
              </section>
            ) : null}

            <SectionBlock title="Spellcasting" sections={statBlock.spellcasting} />
            <SectionBlock title="Traits" sections={statBlock.traits} />
            <SectionBlock title="Actions" sections={statBlock.actions} />
            <SectionBlock title="Bonus Actions" sections={statBlock.bonusActions} />
            <SectionBlock title="Reactions" sections={statBlock.reactions} />

            {showSourceAttribution ? (
              <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--paper)] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
                  Source
                </h4>
                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                  {statBlock.sourceAttribution.sourcebook}
                </p>
                <a
                  href={statBlock.sourceAttribution.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm font-semibold text-[var(--moss-dark)] underline-offset-4 hover:underline"
                >
                  Open source
                </a>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardEntryCard({
  entry,
  onOpenStats,
  onCommitHp,
  onCommitNickname,
  onRemove,
}: {
  entry: BoardEntry;
  onOpenStats: (entry: BoardEntry) => void;
  onCommitHp: (entry: BoardEntry, nextValue: number) => void;
  onCommitNickname: (entry: BoardEntry, nextValue: string) => void;
  onRemove: (entry: BoardEntry) => void;
}) {
  const [nickname, setNickname] = useState(entry.nickname);
  const [hitPoints, setHitPoints] = useState(String(entry.currentHitPoints));
  const [attackResults, setAttackResults] = useState<Record<string, AttackRollResult>>({});
  const attacks = extractAttackActions(entry.statBlockSnapshot);
  const followUpActions = extractFollowUpActions(entry.statBlockSnapshot);
  const attackRoutine = formatAttackRoutine(entry.statBlockSnapshot);
  const armorClassSize = compactArmorClassSize(entry.statBlockSnapshot.armorClass);

  function handleRollAttack(attack: AttackAction) {
    setAttackResults((current) => ({
      ...current,
      [attack.id]: rollAttackAction(attack),
    }));
  }

  return (
    <article className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_20px_50px_rgba(62,44,26,0.1)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label className="block">
            <span className="sr-only">Nickname</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              onBlur={() => onCommitNickname(entry, nickname)}
              className="block w-full bg-transparent font-display text-2xl text-[var(--ink)] outline-none"
            />
          </label>
          <p className="mt-1 text-sm text-[var(--muted)]">{entry.statBlockSnapshot.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(entry)}
          className="rounded-full border border-[rgba(156,61,53,0.2)] bg-[rgba(156,61,53,0.08)] px-3 py-2 text-sm font-semibold text-[var(--danger)]"
        >
          Remove
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(15rem,auto)_1fr] lg:items-stretch">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
          <div className="grid grid-cols-[minmax(4rem,0.85fr)_minmax(8rem,1fr)] gap-3">
            <div className="min-w-0 border-r border-[var(--line)] pr-3">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                AC
              </p>
              <p
                title={entry.statBlockSnapshot.armorClass}
                className={`mt-2 break-words font-semibold leading-tight text-[var(--ink)] ${armorClassSize}`}
              >
                {entry.statBlockSnapshot.armorClass}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                HP
              </p>
              <div className="mt-2 flex items-end gap-2">
                <input
                  inputMode="numeric"
                  value={hitPoints}
                  onChange={(event) => setHitPoints(event.target.value)}
                  onBlur={() => {
                    const nextValue = Number(hitPoints);
                    onCommitHp(entry, Number.isFinite(nextValue) ? nextValue : entry.currentHitPoints);
                  }}
                  className="w-20 bg-transparent text-2xl font-semibold text-[var(--ink)] outline-none"
                />
                <span className="pb-1 text-sm text-[var(--muted)]">/ {entry.maxHitPoints}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            Attacks
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{attackRoutine}</p>
          {followUpActions.length > 0 ? (
            <div className="mt-2 space-y-1">
              {followUpActions.map((action) => (
                <p key={action.id} className="text-xs leading-5 text-[var(--muted)]">
                  <span className="font-semibold text-[var(--ink)]">{action.name}:</span>{" "}
                  {action.summary}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {attacks.map((attack) => {
          const result = attackResults[attack.id];

          return (
            <button
              key={attack.id}
              type="button"
              onClick={() => handleRollAttack(attack)}
              className={attackButtonClassName(result)}
            >
              {attack.name}
              {result ? (
                <span className={result.critical ? "ml-2 text-[var(--paper)]" : "ml-2 text-[var(--muted)]"}>
                  {result.critical ? "Nat 20! " : ""}Hit {result.attackTotal} /{" "}
                  {formatDamageRoll(result)}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onOpenStats(entry)}
          className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)]"
        >
          View stats
        </button>
      </div>
    </article>
  );
}

export function SummonTracker({ initialSummonables }: SummonTrackerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("library");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [crFilter, setCrFilter] = useState("all");
  const [sourcebookFilter, setSourcebookFilter] = useState("all");
  const [modalState, setModalState] = useState<StatBlockModalState>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [boardEntries, setBoardEntries] = useState(() => loadBoardEntries(initialSummonables));

  useEffect(() => {
    const unsubscribe = subscribeBoardEntries(() => {
      setBoardEntries(loadBoardEntries(initialSummonables));
    });

    return unsubscribe;
  }, [initialSummonables]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    function handlePopState() {
      setModalState(null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const summonSourceOptions = Array.from(
    new Set(initialSummonables.flatMap((entry) => entry.data.summonSources)),
  ).sort();
  const typeOptions = Array.from(new Set(initialSummonables.map((entry) => entry.data.statBlock.type))).sort();
  const sizeOptions = Array.from(new Set(initialSummonables.map((entry) => entry.data.statBlock.size))).sort();
  const crOptions = Array.from(
    new Set(initialSummonables.map((entry) => entry.data.statBlock.challengeRating)),
  ).sort((left, right) => {
    const leftValue = parseCrValue(left) ?? Number.POSITIVE_INFINITY;
    const rightValue = parseCrValue(right) ?? Number.POSITIVE_INFINITY;
    return leftValue - rightValue;
  });
  const sourcebookOptions = Array.from(new Set(initialSummonables.map((entry) => entry.source.sourcebook))).sort();

  const filteredSummonables = initialSummonables
    .filter((entry) => {
      const normalizedQuery = deferredQuery.trim().toLowerCase();
      if (
        normalizedQuery &&
        ![entry.name, entry.searchText, entry.source.sourcebook]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }

      if (sourceFilter !== "all" && !entry.data.summonSources.includes(sourceFilter as never)) {
        return false;
      }

      if (typeFilter !== "all" && entry.data.statBlock.type !== typeFilter) {
        return false;
      }

      if (sizeFilter !== "all" && entry.data.statBlock.size !== sizeFilter) {
        return false;
      }

      if (sourcebookFilter !== "all" && entry.source.sourcebook !== sourcebookFilter) {
        return false;
      }

      if (crFilter !== "all") {
        const maximumCr = parseCrValue(crFilter);
        const creatureCr = summonableCrValue(entry);

        if (maximumCr === null || creatureCr === null || creatureCr > maximumCr) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => {
      const leftCr = summonableCrValue(left) ?? Number.NEGATIVE_INFINITY;
      const rightCr = summonableCrValue(right) ?? Number.NEGATIVE_INFINITY;
      const crDifference = rightCr - leftCr;

      return crDifference || left.name.localeCompare(right.name);
    });

  function openStatBlock(nextModalState: NonNullable<StatBlockModalState>) {
    const currentHistoryState = window.history.state;
    const historyState =
      currentHistoryState && typeof currentHistoryState === "object"
        ? { ...currentHistoryState }
        : {};

    window.history.pushState(
      {
        ...historyState,
        [STATS_MODAL_HISTORY_KEY]: true,
      },
      "",
      window.location.href,
    );
    setModalState(nextModalState);
  }

  function closeStatBlock() {
    const currentHistoryState = window.history.state;
    if (
      currentHistoryState &&
      typeof currentHistoryState === "object" &&
      currentHistoryState[STATS_MODAL_HISTORY_KEY]
    ) {
      window.history.back();
      return;
    }

    setModalState(null);
  }

  function handleAddSummonable(entry: CatalogEntry<SummonableData>) {
    try {
      const nextEntry = createBoardEntry(entry);
      replaceBoardEntries([...boardEntries, nextEntry]);
      setFeedback(`${entry.name} added to the board.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Failed to add summon.");
    }
  }

  function handleCommitHp(entry: BoardEntry, nextValue: number) {
    replaceBoardEntries(
      updateBoardEntry(boardEntries, entry.id, {
        currentHitPoints: nextValue,
      }),
    );
  }

  function handleCommitNickname(entry: BoardEntry, nextValue: string) {
    replaceBoardEntries(
      updateBoardEntry(boardEntries, entry.id, {
        nickname: nextValue,
      }),
    );
  }

  function handleRemove(entry: BoardEntry) {
    replaceBoardEntries(removeBoardEntry(boardEntries, entry.id));
    setFeedback(`${entry.nickname} removed from the board.`);
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-3 py-4 pb-24 sm:px-4 lg:px-6">
        {feedback ? <p className="px-1 text-sm text-[var(--muted)]">{feedback}</p> : null}

        <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_25px_80px_rgba(62,44,26,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              Board Tracker
            </p>
            <p className="text-sm text-[var(--muted)]">{boardEntries.length} total on board</p>
          </div>
          {boardEntries.length === 0 ? (
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">No creatures on the board yet.</p>
          ) : null}
        </section>

        <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_25px_80px_rgba(62,44,26,0.12)]">
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "library" as const, label: `Library (${initialSummonables.length})` },
              { key: "board" as const, label: `Board (${boardEntries.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={
                  activeTab === tab.key
                    ? "rounded-[1.4rem] bg-[var(--moss)] px-4 py-3 text-sm font-semibold text-[var(--paper)]"
                    : "rounded-[1.4rem] border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink)]"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "library" ? (
          <section className="space-y-4">
            <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_25px_80px_rgba(62,44,26,0.12)]">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                    Search
                  </span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search summons"
                    className="mt-2 block w-full bg-transparent text-base text-[var(--ink)] outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((current) => !current)}
                  className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-5 py-3 text-sm font-semibold text-[var(--ink)]"
                >
                  {filtersOpen ? "Hide filters" : "Filters"}
                </button>
              </div>

              {filtersOpen ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <FilterField
                    label="Summon source"
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    options={[
                      { label: "All sources", value: "all" },
                      ...summonSourceOptions.map((option) => ({ label: option, value: option })),
                    ]}
                  />
                  <FilterField
                    label="Creature type"
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                      { label: "All types", value: "all" },
                      ...typeOptions.map((option) => ({ label: option, value: option })),
                    ]}
                  />
                  <FilterField
                    label="Size"
                    value={sizeFilter}
                    onChange={setSizeFilter}
                    options={[
                      { label: "All sizes", value: "all" },
                      ...sizeOptions.map((option) => ({ label: option, value: option })),
                    ]}
                  />
                  <FilterField
                    label="Max CR"
                    value={crFilter}
                    onChange={setCrFilter}
                    options={[
                      { label: "Any CR", value: "all" },
                      ...crOptions.map((option) => ({ label: option, value: option })),
                    ]}
                  />
                  <FilterField
                    label="Sourcebook"
                    value={sourcebookFilter}
                    onChange={setSourcebookFilter}
                    options={[
                      { label: "All books", value: "all" },
                      ...sourcebookOptions.map((option) => ({ label: option, value: option })),
                    ]}
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-4">
              {filteredSummonables.length === 0 ? (
                <div className="rounded-[2rem] border border-dashed border-[var(--line)] bg-[var(--card)] px-5 py-12 text-center text-sm leading-7 text-[var(--muted)]">
                  No summons match the current filters.
                </div>
              ) : (
                filteredSummonables.map((entry) => (
                  <article
                    key={entry.slug}
                    className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_25px_80px_rgba(62,44,26,0.12)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h2 className="font-display text-3xl text-[var(--ink)]">{entry.name}</h2>
                        <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                          {formatCr(entry.data.statBlock.challengeRating)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openStatBlock({
                              title: entry.name,
                              subtitle: `${entry.data.statBlock.type} • ${formatCr(entry.data.statBlock.challengeRating)}`,
                              statBlock: entry.data.statBlock,
                              sourceTags: entry.data.summonSources,
                              showSourceAttribution: true,
                            })
                          }
                          className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm font-semibold text-[var(--ink)]"
                        >
                          View stats
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddSummonable(entry)}
                          className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-4 py-2 text-sm font-semibold text-[var(--paper)]"
                        >
                          Add to board
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            {boardEntries.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-[var(--line)] bg-[var(--card)] px-5 py-12 text-center text-sm leading-7 text-[var(--muted)]">
                Your board is empty. Add creatures from the Library tab to start tracking summons.
              </div>
            ) : (
              boardEntries.map((boardEntry) => (
                <BoardEntryCard
                  key={`${boardEntry.id}-${boardEntry.updatedAt}`}
                  entry={boardEntry}
                  onOpenStats={(boardEntry) =>
                    openStatBlock({
                      title: boardEntry.nickname,
                      subtitle: boardEntry.statBlockSnapshot.name,
                      statBlock: boardEntry.statBlockSnapshot,
                      sourceTags: [],
                      showSourceAttribution: false,
                    })
                  }
                  onCommitHp={handleCommitHp}
                  onCommitNickname={handleCommitNickname}
                  onRemove={handleRemove}
                />
              ))
            )}
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[rgba(255,249,239,0.96)] px-3 py-3 backdrop-blur-sm sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          {[
            { key: "library" as const, label: "Library", count: initialSummonables.length },
            { key: "board" as const, label: "Board", count: boardEntries.length },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={
                activeTab === tab.key
                  ? "flex-1 rounded-full bg-[var(--moss)] px-4 py-3 text-sm font-semibold text-[var(--paper)]"
                  : "flex-1 rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm font-semibold text-[var(--ink)]"
              }
            >
              {tab.label} / {tab.count}
            </button>
          ))}
        </div>
      </div>

      {modalState ? (
        <StatBlockSheet
          title={modalState.title}
          subtitle={modalState.subtitle}
          statBlock={modalState.statBlock}
          sourceTags={modalState.sourceTags}
          showSourceAttribution={modalState.showSourceAttribution}
          onClose={closeStatBlock}
        />
      ) : null}
    </>
  );
}
