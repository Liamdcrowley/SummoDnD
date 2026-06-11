import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { listSummonables } from "@/lib/summons";

async function main() {
  const outputPath = resolve(process.cwd(), "src/generated/summonables.json");
  const summonables = await listSummonables();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summonables, null, 2)}\n`, "utf8");

  console.log(`Wrote ${summonables.length} summonables to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
