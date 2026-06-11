import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import summonablesData from "@/generated/summonables.json";
import type { CatalogEntry, StatBlock, StatBlockSection, SummonableData } from "@/lib/types";

const summonables = summonablesData as unknown as CatalogEntry<SummonableData>[];

function formatList(values: string[]) {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered.join(", ") : "None";
}

function formatSpeed(speed: Record<string, string>) {
  const entries = Object.entries(speed)
    .filter(([, value]) => value.trim().length > 0)
    .map(([mode, value]) => `${mode}: ${value}`);

  return entries.length > 0 ? entries.join(", ") : "None";
}

function formatAbilities(statBlock: StatBlock) {
  return [
    `STR ${statBlock.abilities.str}`,
    `DEX ${statBlock.abilities.dex}`,
    `CON ${statBlock.abilities.con}`,
    `INT ${statBlock.abilities.int}`,
    `WIS ${statBlock.abilities.wis}`,
    `CHA ${statBlock.abilities.cha}`,
  ].join(" | ");
}

function pushSection(lines: string[], title: string, sections: StatBlockSection[]) {
  if (sections.length === 0) {
    return;
  }

  lines.push(`### ${title}`);
  lines.push("");

  for (const section of sections) {
    lines.push(`- **${section.name}:**`);
    for (const entry of section.entries) {
      lines.push(`  - ${entry}`);
    }
  }

  lines.push("");
}

function buildCreatureMarkdown(entry: CatalogEntry<SummonableData>) {
  const statBlock = entry.data.statBlock;
  const lines: string[] = [];

  lines.push(`## ${entry.name}`);
  lines.push("");
  lines.push(`- **Summon spells:** ${entry.data.summonSources.join(", ")}`);
  lines.push(`- **Sourcebook:** ${entry.source.sourcebook}`);
  lines.push(`- **Source URL:** ${entry.source.sourceUrl}`);
  lines.push(`- **Size:** ${statBlock.size}`);
  lines.push(`- **Type:** ${statBlock.type}`);
  lines.push(`- **Alignment:** ${statBlock.alignment}`);
  lines.push(`- **Armor Class:** ${statBlock.armorClass}`);
  lines.push(`- **Hit Points:** ${statBlock.hitPoints}`);
  lines.push(`- **Speed:** ${formatSpeed(statBlock.speed)}`);
  lines.push(`- **Challenge Rating:** ${statBlock.challengeRating}`);
  lines.push(`- **Saving Throws:** ${formatList(statBlock.savingThrows)}`);
  lines.push(`- **Skills:** ${formatList(statBlock.skills)}`);
  lines.push(`- **Senses:** ${formatList(statBlock.senses)}`);
  lines.push(`- **Languages:** ${formatList(statBlock.languages)}`);
  lines.push(`- **Damage Vulnerabilities:** ${formatList(statBlock.damageVulnerabilities)}`);
  lines.push(`- **Damage Resistances:** ${formatList(statBlock.damageResistances)}`);
  lines.push(`- **Damage Immunities:** ${formatList(statBlock.damageImmunities)}`);
  lines.push(`- **Condition Immunities:** ${formatList(statBlock.conditionImmunities)}`);
  lines.push(`- **Ability Scores:** ${formatAbilities(statBlock)}`);
  lines.push("");

  if (statBlock.notes && statBlock.notes.length > 0) {
    lines.push("### Notes");
    lines.push("");
    for (const entryText of statBlock.notes) {
      lines.push(`- ${entryText}`);
    }
    lines.push("");
  }

  pushSection(lines, "Spellcasting", statBlock.spellcasting);
  pushSection(lines, "Traits", statBlock.traits);
  pushSection(lines, "Actions", statBlock.actions);
  pushSection(lines, "Bonus Actions", statBlock.bonusActions);
  pushSection(lines, "Reactions", statBlock.reactions);

  return lines.join("\n");
}

async function main() {
  const outputPath = resolve(process.cwd(), "data/summon-statblocks.md");
  const lines: string[] = [];
  const sortedSummonables = [...summonables].sort((left, right) => left.name.localeCompare(right.name));
  const spellNames = [...new Set(sortedSummonables.flatMap((entry) => entry.data.summonSources))].sort();

  lines.push("# SummoDnD Summon Stat Blocks");
  lines.push("");
  lines.push("This file contains the current summon pool used by the app.");
  lines.push("");
  lines.push(`- **Spells in scope:** ${spellNames.join(", ")}`);
  lines.push(`- **Creature count:** ${sortedSummonables.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const entry of sortedSummonables) {
    lines.push(buildCreatureMarkdown(entry));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${sortedSummonables.length} summon stat blocks to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
