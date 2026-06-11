import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sourcePages = sqliteTable(
  "source_pages",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    slug: text("slug").notNull(),
    kind: text("kind").notNull(),
    sourcebook: text("sourcebook"),
    fetchedAt: text("fetched_at").notNull(),
    checksum: text("checksum").notNull(),
    rawHtmlPath: text("raw_html_path").notNull(),
    cleanedTextPath: text("cleaned_text_path").notNull(),
    parseStatus: text("parse_status").notNull(),
    official: integer("official", { mode: "boolean" }).notNull(),
    license: text("license").notNull(),
  },
  (table) => ({
    sourcePagesUrlIdx: uniqueIndex("source_pages_url_idx").on(table.url),
  }),
);

export const catalogEntries = sqliteTable(
  "catalog_entries",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sourcePageSlug: text("source_page_slug"),
    sourcebook: text("sourcebook").notNull(),
    sourceUrl: text("source_url").notNull(),
    searchText: text("search_text").notNull(),
    official: integer("official", { mode: "boolean" }).notNull(),
    license: text("license").notNull(),
    data: text("data").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    catalogEntriesKindSlugIdx: uniqueIndex("catalog_entries_kind_slug_idx").on(
      table.kind,
      table.slug,
    ),
  }),
);

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: integer("level").notNull(),
  classSlug: text("class_slug").notNull(),
  subclassSlug: text("subclass_slug").notNull(),
  lineageSlug: text("lineage_slug"),
  lineageVariantSlug: text("lineage_variant_slug"),
  backgroundSlug: text("background_slug"),
  abilityScores: text("ability_scores").notNull(),
  settings: text("settings").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const characterLevels = sqliteTable("character_levels", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  level: integer("level").notNull(),
  createdAt: text("created_at").notNull(),
});

export const characterSelections = sqliteTable("character_selections", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  selectionKey: text("selection_key").notNull(),
  level: integer("level").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const preparedSpells = sqliteTable("prepared_spells", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  spellSlug: text("spell_slug").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  itemSlug: text("item_slug"),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  metadata: text("metadata"),
});

export const wildShapeKnownSeen = sqliteTable("wild_shape_known_seen", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  beastSlug: text("beast_slug").notNull(),
  seen: integer("seen", { mode: "boolean" }).notNull(),
  known: integer("known", { mode: "boolean" }).notNull(),
});

export const currentSummons = sqliteTable("current_summons", {
  id: text("id").primaryKey(),
  characterId: text("character_id").notNull(),
  creatureSlug: text("creature_slug").notNull(),
  nickname: text("nickname").notNull(),
  currentHitPoints: integer("current_hit_points").notNull(),
  maxHitPoints: integer("max_hit_points").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const boardEntries = sqliteTable("board_entries", {
  id: text("id").primaryKey(),
  summonableSlug: text("summonable_slug").notNull(),
  nickname: text("nickname").notNull(),
  currentHitPoints: integer("current_hit_points").notNull(),
  maxHitPoints: integer("max_hit_points").notNull(),
  statBlockSnapshot: text("stat_block_snapshot").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
