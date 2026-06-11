import { syncSources } from "@/lib/source-sync";

async function main() {
  const summary = await syncSources();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
