"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CatalogEntry, LineageData, BackgroundData } from "@/lib/types";

type CreateCharacterFormProps = {
  lineages: CatalogEntry<LineageData>[];
  backgrounds: CatalogEntry<BackgroundData>[];
  disabled?: boolean;
};

const defaultAbilityScores = {
  str: 8,
  dex: 14,
  con: 14,
  int: 10,
  wis: 16,
  cha: 12,
};

export function CreateCharacterForm({
  lineages,
  backgrounds,
  disabled = false,
}: CreateCharacterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("Shepherd Prototype");
  const [lineageSlug, setLineageSlug] = useState(lineages[0]?.slug ?? "");
  const [lineageVariantSlug, setLineageVariantSlug] = useState(
    lineages[0]?.data.variants[0]?.slug ?? "",
  );
  const [backgroundSlug, setBackgroundSlug] = useState(backgrounds[0]?.slug ?? "");
  const [abilityScores, setAbilityScores] = useState(defaultAbilityScores);
  const [featsEnabled, setFeatsEnabled] = useState(true);
  const [tashaOptionalDruidFeatures, setTashaOptionalDruidFeatures] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLineage = lineages.find((entry) => entry.slug === lineageSlug);

  function updateScore(ability: keyof typeof defaultAbilityScores, value: string) {
    setAbilityScores((current) => ({
      ...current,
      [ability]: Number(value),
    }));
  }

  function handleLineageChange(value: string) {
    setLineageSlug(value);
    const lineage = lineages.find((entry) => entry.slug === value);
    setLineageVariantSlug(lineage?.data.variants[0]?.slug ?? "");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          lineageSlug: lineageSlug || null,
          lineageVariantSlug: lineageVariantSlug || null,
          backgroundSlug: backgroundSlug || null,
          abilityScores,
          settings: {
            featsEnabled,
            tashaOptionalDruidFeatures,
          },
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Character creation failed.");
        return;
      }

      const data = (await response.json()) as { characterId: string };
      router.push(`/characters/${data.characterId}`);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_25px_80px_rgba(62,44,26,0.12)]"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
          Character Creation
        </p>
        <h2 className="font-display text-3xl text-[var(--ink)]">
          Start a Circle of the Shepherd druid
        </h2>
        <p className="text-sm leading-7 text-[var(--muted)]">
          The class and subclass are fixed for v1. Race, background, ability scores,
          feats, prepared spells, and level-up decisions stay interactive.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-[var(--ink)]">Character name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={disabled || isPending}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--moss)]"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-[var(--ink)]">Background</span>
          <select
            value={backgroundSlug}
            onChange={(event) => setBackgroundSlug(event.target.value)}
            disabled={disabled || isPending}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--moss)]"
          >
            {backgrounds.map((background) => (
              <option key={background.slug} value={background.slug}>
                {background.name} ({background.source.sourcebook})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-[var(--ink)]">Lineage</span>
          <select
            value={lineageSlug}
            onChange={(event) => handleLineageChange(event.target.value)}
            disabled={disabled || isPending}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--moss)]"
          >
            {lineages.map((lineage) => (
              <option key={lineage.slug} value={lineage.slug}>
                {lineage.name} ({lineage.source.sourcebook})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-[var(--ink)]">Variant</span>
          <select
            value={lineageVariantSlug}
            onChange={(event) => setLineageVariantSlug(event.target.value)}
            disabled={disabled || isPending || !selectedLineage || selectedLineage.data.variants.length === 0}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--moss)]"
          >
            {selectedLineage?.data.variants.length ? (
              selectedLineage.data.variants.map((variant) => (
                <option key={variant.slug} value={variant.slug}>
                  {variant.name} ({variant.sourcebook})
                </option>
              ))
            ) : (
              <option value="">No variant required</option>
            )}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
          Ability Scores
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(abilityScores).map(([ability, value]) => (
            <label
              key={ability}
              className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4"
            >
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                {ability}
              </span>
              <input
                type="number"
                min={3}
                max={20}
                value={value}
                onChange={(event) =>
                  updateScore(ability as keyof typeof defaultAbilityScores, event.target.value)
                }
                disabled={disabled || isPending}
                className="mt-2 w-full bg-transparent text-3xl font-semibold text-[var(--ink)] outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <input
            type="checkbox"
            checked={featsEnabled}
            onChange={(event) => setFeatsEnabled(event.target.checked)}
            disabled={disabled || isPending}
            className="mt-1 h-4 w-4 rounded border-[var(--line)]"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">Feats enabled</span>
            <span className="text-sm text-[var(--muted)]">
              Keeps ASI vs feat choices live at levels 4, 8, 12, 16, and 19.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
          <input
            type="checkbox"
            checked={tashaOptionalDruidFeatures}
            onChange={(event) => setTashaOptionalDruidFeatures(event.target.checked)}
            disabled={disabled || isPending}
            className="mt-1 h-4 w-4 rounded border-[var(--line)]"
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--ink)]">
              Tasha’s optional druid features
            </span>
            <span className="text-sm text-[var(--muted)]">
              Starts off disabled, but keeps Wild Companion and other optional notes available.
            </span>
          </span>
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={disabled || isPending}
          className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--moss-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create Character"}
        </button>
        {disabled ? (
          <p className="text-sm text-[var(--muted)]">
            Sync the source catalog first so the form has real options.
          </p>
        ) : null}
      </div>
    </form>
  );
}
