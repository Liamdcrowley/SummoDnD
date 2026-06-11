import { SummonTracker } from "@/components/summon-tracker";
import summonablesData from "@/generated/summonables.json";
import type { CatalogEntry, SummonableData } from "@/lib/types";

const summonables = summonablesData as unknown as CatalogEntry<SummonableData>[];

export default function Home() {
  return <SummonTracker initialSummonables={summonables} />;
}
