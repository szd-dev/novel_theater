import { existsSync } from "node:fs";
import { join } from "node:path";
import { globNovelFiles, readNovelFile } from "@/store/story-files";
import { estimateTokens } from "./token-estimator";
import {
  extractL0,
  extractL1,
  extractSectionLines,
  extractSceneSummary,
  extractCharactersInScene,
  extractLocationFromWorld,
  extractSceneLocation,
  findLatestScene,
} from "./extract";
import { findCharacterByName } from "./character-resolver";

export interface ContextConfig {
  tokenBudget?: number;
  sectionPriorities?: Record<string, number>;
}

export interface ContextSection {
  label: string;
  content: string;
  priority: number;
}

const DEFAULT_TOKEN_BUDGET = 2000;

const DEFAULT_PRIORITIES: Record<string, number> = {
  在场角色: 0,
  当前场景: 1,
  场景地点: 1,
  已知角色: 2,
  剧情方向: 2,
  角色详情: 4,
};

export async function buildStoryContext(
  dir: string,
  config?: ContextConfig,
): Promise<string | null> {
  const novelDir = join(dir, ".novel");
  if (!existsSync(novelDir)) return null;

  const tokenBudget = config?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const priorities = { ...DEFAULT_PRIORITIES, ...config?.sectionPriorities };

  const latestSceneName = await findLatestScene(dir);
  let sceneSummary = "";
  let sceneFullContent = "";
  let charactersInScene: string[] = [];

  if (latestSceneName) {
    const sceneContent = await readNovelFile(dir, `scenes/${latestSceneName}`);
    if (sceneContent) {
      sceneSummary = extractSceneSummary(sceneContent);
      sceneFullContent = sceneContent;
      charactersInScene = extractCharactersInScene(sceneContent);
    }
  } else {
    sceneSummary = "故事尚未开始";
  }

  let locationDescription = "";
  if (sceneFullContent) {
    const sceneLocation = extractSceneLocation(sceneFullContent);
    if (sceneLocation) {
      const worldContent = await readNovelFile(dir, "world.md");
      if (worldContent) {
        locationDescription = extractLocationFromWorld(worldContent, sceneLocation);
      }
    }
  }

  const resolvedSceneChars: string[] = [];
  for (const rawName of charactersInScene) {
    const resolved = await findCharacterByName(dir, rawName);
    resolvedSceneChars.push(resolved || rawName);
  }

  const allCharL0Map = new Map<string, string>();

  const charEntries = await globNovelFiles(dir, "characters");
  for (const entry of charEntries) {
    const charName = entry.replace(".md", "");
    const content = await readNovelFile(dir, `characters/${entry}`);
    if (!content) continue;
    const l0 = extractL0(content);
    if (l0) allCharL0Map.set(charName, l0);
  }

  const sceneCharL0: string[] = [];
  const otherCharL0: string[] = [];
  const characterBlocks: string[] = [];
  const characterL0Only: string[] = [];

  const sortedEntries = [...allCharL0Map.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  for (const [name, l0] of sortedEntries) {
    const isInScene = resolvedSceneChars.some(
      (cn) => cn === name || cn.includes(name),
    );
    if (isInScene) {
      sceneCharL0.push(`${name}：${l0}`);
      characterL0Only.push(l0);

      const charContent = await readNovelFile(dir, `characters/${name}.md`);
      if (charContent) {
        const l1 = extractL1(charContent, 150);
        const block = l1 ? `${l0}\n${l1}` : l0;
        characterBlocks.push(block);
      }
    } else {
      otherCharL0.push(`${name}：${l0}`);
    }
  }

  const plotContent = await readNovelFile(dir, "plot.md");
  let plotSummary = "";
  if (plotContent) {
    plotSummary = extractSectionLines(plotContent, "主线", 3);
  }

  const sections: ContextSection[] = [];

  if (sceneCharL0.length > 0) {
    sections.push({
      label: "在场角色",
      content: sceneCharL0.join("\n"),
      priority: priorities["在场角色"],
    });
  }

  if (sceneFullContent) {
    sections.push({
      label: "当前场景",
      content: sceneFullContent,
      priority: priorities["当前场景"],
    });
  } else if (sceneSummary) {
    sections.push({
      label: "当前场景",
      content: sceneSummary,
      priority: priorities["当前场景"],
    });
  }

  if (locationDescription) {
    sections.push({
      label: "场景地点",
      content: locationDescription,
      priority: priorities["场景地点"],
    });
  }

  if (otherCharL0.length > 0) {
    sections.push({
      label: "已知角色",
      content: otherCharL0.join("\n"),
      priority: priorities["已知角色"],
    });
  }

  if (plotSummary) {
    sections.push({
      label: "剧情方向",
      content: plotSummary,
      priority: priorities["剧情方向"],
    });
  }

  const l1Details: string[] = [];
  for (let i = 0; i < characterBlocks.length; i++) {
    const l0 = characterL0Only[i] || "";
    const block = characterBlocks[i];
    const l1Part = block.slice(l0.length).trim();
    if (l1Part) l1Details.push(l1Part);
  }
  if (l1Details.length > 0) {
    sections.push({
      label: "角色详情",
      content: l1Details.join("\n"),
      priority: priorities["角色详情"],
    });
  }

  sections.sort((a, b) => a.priority - b.priority);

  const outputParts: string[] = [];
  let usedTokens = 0;

  for (const section of sections) {
    const header = `## ${section.label}`;
    const fullSection = `${header}\n${section.content}`;
    const sectionTokens = estimateTokens(fullSection);

    if (usedTokens + sectionTokens <= tokenBudget) {
      outputParts.push(fullSection);
      usedTokens += sectionTokens;
    } else {
      const remainingTokens = tokenBudget - usedTokens;
      if (remainingTokens > estimateTokens(header) + 10) {
        const contentChars = (remainingTokens - estimateTokens(header)) * 3;
        const truncated = section.content.slice(0, contentChars);
        outputParts.push(`${header}\n${truncated}`);
        usedTokens = tokenBudget;
      }
      break;
    }
  }

  if (outputParts.length === 0) return null;
  return outputParts.join("\n\n");
}
