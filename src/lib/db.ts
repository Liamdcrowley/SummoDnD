import { existsSync, mkdirSync } from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { dataDir, databaseFile, rawDir } from "@/lib/paths";
import * as schema from "@/lib/schema";

const bootstrapSql = `
CREATE TABLE IF NOT EXISTS source_pages (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  sourcebook TEXT,
  fetched_at TEXT NOT NULL,
  checksum TEXT NOT NULL,
  raw_html_path TEXT NOT NULL,
  cleaned_text_path TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  official INTEGER NOT NULL,
  license TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_entries (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  source_page_slug TEXT,
  sourcebook TEXT NOT NULL,
  source_url TEXT NOT NULL,
  search_text TEXT NOT NULL,
  official INTEGER NOT NULL,
  license TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_entries_kind_slug_idx
  ON catalog_entries(kind, slug);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  class_slug TEXT NOT NULL,
  subclass_slug TEXT NOT NULL,
  lineage_slug TEXT,
  lineage_variant_slug TEXT,
  background_slug TEXT,
  ability_scores TEXT NOT NULL,
  settings TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_levels (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_selections (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  selection_key TEXT NOT NULL,
  level INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prepared_spells (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  spell_slug TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  item_slug TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS wild_shape_known_seen (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  beast_slug TEXT NOT NULL,
  seen INTEGER NOT NULL,
  known INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS current_summons (
  id TEXT PRIMARY KEY NOT NULL,
  character_id TEXT NOT NULL,
  creature_slug TEXT NOT NULL,
  nickname TEXT NOT NULL,
  current_hit_points INTEGER NOT NULL,
  max_hit_points INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_entries (
  id TEXT PRIMARY KEY NOT NULL,
  summonable_slug TEXT NOT NULL,
  nickname TEXT NOT NULL,
  current_hit_points INTEGER NOT NULL,
  max_hit_points INTEGER NOT NULL,
  stat_block_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

type DatabaseBundle = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

declare global {
  var __druidBuilderDb: DatabaseBundle | undefined;
}

function ensureDirectories() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }
}

function createBundle(): DatabaseBundle {
  ensureDirectories();

  const sqlite = new Database(databaseFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(bootstrapSql);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  };
}

export function getDatabase() {
  if (!globalThis.__druidBuilderDb) {
    globalThis.__druidBuilderDb = createBundle();
  }

  return globalThis.__druidBuilderDb;
}

export const database = getDatabase().db;
export const sqlite = getDatabase().sqlite;
