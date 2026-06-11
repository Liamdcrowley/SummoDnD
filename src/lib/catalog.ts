import { and, asc, eq } from "drizzle-orm";

import { parseJson, stringifyJson } from "@/lib/json";
import { database } from "@/lib/db";
import { catalogEntries, sourcePages } from "@/lib/schema";
import type { CatalogData, CatalogEntry, CatalogKind } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

export async function upsertSourcePage(params: {
  url: string;
  slug: string;
  kind: string;
  sourcebook?: string;
  checksum: string;
  rawHtmlPath: string;
  cleanedTextPath: string;
  parseStatus: string;
  official: boolean;
  license: string;
}) {
  const existing = await database.query.sourcePages.findFirst({
    where: eq(sourcePages.url, params.url),
  });

  const record = {
    id: existing?.id ?? createId("src"),
    url: params.url,
    slug: params.slug,
    kind: params.kind,
    sourcebook: params.sourcebook ?? null,
    fetchedAt: nowIso(),
    checksum: params.checksum,
    rawHtmlPath: params.rawHtmlPath,
    cleanedTextPath: params.cleanedTextPath,
    parseStatus: params.parseStatus,
    official: params.official,
    license: params.license,
  };

  await database
    .insert(sourcePages)
    .values(record)
    .onConflictDoUpdate({
      target: sourcePages.url,
      set: {
        slug: record.slug,
        kind: record.kind,
        sourcebook: record.sourcebook,
        fetchedAt: record.fetchedAt,
        checksum: record.checksum,
        rawHtmlPath: record.rawHtmlPath,
        cleanedTextPath: record.cleanedTextPath,
        parseStatus: record.parseStatus,
        official: record.official,
        license: record.license,
      },
    });

  return record.id;
}

export async function upsertCatalogEntry<T extends CatalogData>(entry: CatalogEntry<T>) {
  const existing = await database.query.catalogEntries.findFirst({
    where: and(eq(catalogEntries.kind, entry.kind), eq(catalogEntries.slug, entry.slug)),
  });

  const record = {
    id: existing?.id ?? createId("cat"),
    kind: entry.kind,
    slug: entry.slug,
    name: entry.name,
    sourcePageSlug: entry.sourcePageSlug ?? null,
    sourcebook: entry.source.sourcebook,
    sourceUrl: entry.source.sourceUrl,
    searchText: entry.searchText,
    official: entry.source.official,
    license: entry.source.license,
    data: stringifyJson(entry.data),
    updatedAt: nowIso(),
  };

  await database
    .insert(catalogEntries)
    .values(record)
    .onConflictDoUpdate({
      target: [catalogEntries.kind, catalogEntries.slug],
      set: {
        name: record.name,
        sourcePageSlug: record.sourcePageSlug,
        sourcebook: record.sourcebook,
        sourceUrl: record.sourceUrl,
        searchText: record.searchText,
        official: record.official,
        license: record.license,
        data: record.data,
        updatedAt: record.updatedAt,
      },
    });
}

export async function getCatalogEntry<T extends CatalogData>(kind: CatalogKind, slug: string) {
  const row = await database.query.catalogEntries.findFirst({
    where: and(eq(catalogEntries.kind, kind), eq(catalogEntries.slug, slug)),
  });

  if (!row) {
    return null;
  }

  return {
    kind: row.kind as CatalogKind,
    slug: row.slug,
    name: row.name,
    sourcePageSlug: row.sourcePageSlug ?? undefined,
    source: {
      sourcebook: row.sourcebook,
      sourceUrl: row.sourceUrl,
      license: row.license,
      official: row.official,
    },
    searchText: row.searchText,
    data: parseJson<T>(row.data),
  } satisfies CatalogEntry<T>;
}

export async function listCatalogEntries<T extends CatalogData>(kind: CatalogKind) {
  const rows = await database.query.catalogEntries.findMany({
    where: eq(catalogEntries.kind, kind),
    orderBy: [asc(catalogEntries.name)],
  });

  return rows.map((row) => ({
    kind: row.kind as CatalogKind,
    slug: row.slug,
    name: row.name,
    sourcePageSlug: row.sourcePageSlug ?? undefined,
    source: {
      sourcebook: row.sourcebook,
      sourceUrl: row.sourceUrl,
      license: row.license,
      official: row.official,
    },
    searchText: row.searchText,
    data: parseJson<T>(row.data),
  })) satisfies CatalogEntry<T>[];
}

export async function deleteCatalogEntriesByKind(kind: CatalogKind) {
  await database.delete(catalogEntries).where(eq(catalogEntries.kind, kind));
}

export async function getCatalogSummary() {
  const rows = await database.query.catalogEntries.findMany({
    orderBy: [asc(catalogEntries.kind), asc(catalogEntries.name)],
  });

  return rows.reduce<Record<string, number>>((summary, row) => {
    summary[row.kind] = (summary[row.kind] ?? 0) + 1;
    return summary;
  }, {});
}
