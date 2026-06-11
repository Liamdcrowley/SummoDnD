"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncButtonProps = {
  counts: Record<string, number>;
};

export function SyncButton({ counts }: SyncButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/sources/sync", {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setMessage(data.error ?? "Sync failed.");
        return;
      }

      const data = (await response.json()) as { counts?: Record<string, number> };
      setMessage(`Synced ${Object.values(data.counts ?? {}).reduce((sum, count) => sum + count, 0)} catalog records.`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-6 shadow-[0_25px_80px_rgba(62,44,26,0.12)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--muted)]">
            Source Sync
          </p>
          <h2 className="font-display text-3xl text-[var(--ink)]">Load the druid catalog</h2>
          <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
            Pulls the Druid, Circle of the Shepherd, druid spells, official feats,
            official backgrounds, top-level lineages, equipment, and Wild Shape beast
            forms into your local SQLite catalog.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isPending}
          className="rounded-full border border-[var(--moss)] bg-[var(--moss)] px-5 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--moss-dark)] disabled:cursor-wait disabled:opacity-70"
        >
          {isPending ? "Syncing…" : "Sync Sources"}
        </button>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {Object.entries(counts).length === 0 ? (
          <span className="rounded-full border border-dashed border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]">
            No catalog data yet
          </span>
        ) : (
          Object.entries(counts).map(([key, value]) => (
            <span
              key={key}
              className="rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2 text-sm text-[var(--ink)]"
            >
              {key}: {value}
            </span>
          ))
        )}
      </div>
      {message ? (
        <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
      ) : null}
    </section>
  );
}
