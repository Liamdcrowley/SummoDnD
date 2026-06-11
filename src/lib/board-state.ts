import type { BoardEntry, BoardEntryRecord, CatalogEntry, SummonableData } from "@/lib/types";

const BOARD_STORAGE_KEY = "druid-summon-board-v1";
const boardListeners = new Set<() => void>();

function nowIso() {
  return new Date().toISOString();
}

function createBrowserId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneBoardRecord(entry: BoardEntryRecord): BoardEntryRecord {
  return {
    ...entry,
    statBlockSnapshot: structuredClone(entry.statBlockSnapshot),
  };
}

function toStoredBoardEntries(entries: BoardEntry[]) {
  return entries.map((entry) =>
    cloneBoardRecord({
      id: entry.id,
      summonableSlug: entry.summonableSlug,
      nickname: entry.nickname,
      currentHitPoints: entry.currentHitPoints,
      maxHitPoints: entry.maxHitPoints,
      statBlockSnapshot: entry.statBlockSnapshot,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }),
  );
}

function summonableMap(summonables: CatalogEntry<SummonableData>[]) {
  return new Map(summonables.map((entry) => [entry.slug, entry]));
}

export function clampBoardHitPoints(value: number, maxHitPoints: number) {
  return Math.max(0, Math.min(maxHitPoints, Math.round(value)));
}

export function hydrateBoardEntries(
  records: BoardEntryRecord[],
  summonables: CatalogEntry<SummonableData>[],
) {
  const bySlug = summonableMap(summonables);

  return records.map((record) => ({
    ...cloneBoardRecord(record),
    summonable: bySlug.get(record.summonableSlug) ?? null,
  })) satisfies BoardEntry[];
}

export function loadBoardEntries(summonables: CatalogEntry<SummonableData>[]) {
  return hydrateBoardEntries(loadStoredBoardEntryRecords(), summonables);
}

export function loadStoredBoardEntryRecords() {
  if (typeof window === "undefined") {
    return [] satisfies BoardEntryRecord[];
  }

  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (!raw) {
      return [] satisfies BoardEntryRecord[];
    }

    return (JSON.parse(raw) as BoardEntryRecord[]).map((entry) => cloneBoardRecord(entry));
  } catch {
    return [] satisfies BoardEntryRecord[];
  }
}

export function saveBoardEntries(entries: BoardEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(toStoredBoardEntries(entries)));
  } catch {
    // Ignore storage errors so the board still works in-memory.
  }
}

function emitBoardChange() {
  for (const listener of boardListeners) {
    listener();
  }
}

export function replaceBoardEntries(entries: BoardEntry[]) {
  saveBoardEntries(entries);
  emitBoardChange();
}

export function subscribeBoardEntries(listener: () => void) {
  boardListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      boardListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === BOARD_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    boardListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function createBoardEntry(
  summonable: CatalogEntry<SummonableData>,
  nickname?: string,
) {
  if (summonable.data.summonableKind !== "existing-creature") {
    throw new Error("This static board only supports fixed creature stat blocks.");
  }

  const timestamp = nowIso();
  const statBlock = structuredClone(summonable.data.statBlock);

  return {
    id: createBrowserId("board"),
    summonableSlug: summonable.slug,
    nickname: nickname?.trim() || summonable.name,
    currentHitPoints: statBlock.maxHitPoints,
    maxHitPoints: statBlock.maxHitPoints,
    statBlockSnapshot: statBlock,
    createdAt: timestamp,
    updatedAt: timestamp,
    summonable,
  } satisfies BoardEntry;
}

export function updateBoardEntry(
  entries: BoardEntry[],
  id: string,
  patch: {
    nickname?: string;
    currentHitPoints?: number;
  },
) {
  const updatedAt = nowIso();

  return entries.map((entry) => {
    if (entry.id !== id) {
      return entry;
    }

    return {
      ...entry,
      nickname:
        patch.nickname !== undefined ? patch.nickname.trim() || entry.nickname : entry.nickname,
      currentHitPoints:
        patch.currentHitPoints !== undefined
          ? clampBoardHitPoints(patch.currentHitPoints, entry.maxHitPoints)
          : entry.currentHitPoints,
      updatedAt,
    };
  });
}

export function removeBoardEntry(entries: BoardEntry[], id: string) {
  return entries.filter((entry) => entry.id !== id);
}
