# SummoDnD

Static Next.js app for browsing the allowed druid summon pool and tracking active summons on a personal board.

## What Ships

- `Library` tab with the current allowed summon list
- `Board` tab with duplicate-aware summon tracking
- Full stat block modal for every creature
- Browser-local board persistence with `localStorage`
- Static GitHub Pages deployment from the checked-in summon catalog snapshot

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Static Build

```bash
npm run build
```

The static site is exported to `out/`.

## Refreshing the Summon Catalog

If you ever change the source filters or re-sync data:

```bash
npm run sources:sync
npm run catalog:export
```

That updates the checked-in static snapshot at `src/generated/summonables.json`.

## GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`.

To use it:

1. Push the repo to GitHub.
2. In `Settings -> Pages`, set `Source` to `GitHub Actions`.
3. Push to `main` or run the workflow manually.

The workflow builds the static export and deploys the `out/` folder to GitHub Pages. It automatically sets `NEXT_PUBLIC_BASE_PATH` to the repo name so project pages work under `https://USERNAME.github.io/REPO/`.
