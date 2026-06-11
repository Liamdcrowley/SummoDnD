import { join } from "node:path";

export const projectRoot = /* turbopackIgnore: true */ process.cwd();
export const dataDir = join(projectRoot, "data");
export const rawDir = join(dataDir, "raw");
export const fixtureDir = join(projectRoot, "src", "test", "fixtures");
export const databaseFile = join(dataDir, "druid-builder.sqlite");
