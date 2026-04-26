import { globNovelFiles, readNovelFile } from "@/store/story-files";
import { estimateTokens } from "./token-estimator";

const L1_SECTIONS = ["身份", "当前状态", "关系", "记忆"];

export function extractL0(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.startsWith("> ")) return line.slice(2);
  }
  return "";
}

export function extractL1(content: string, maxTokens: number): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let currentSection: string | null = null;
  let linesInSection = 0;
  let usedTokens = 0;

  for (const line of lines) {
    const sectionMatch = line.match(/^#{2,3}\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      linesInSection = 0;
      continue;
    }

    if (currentSection && L1_SECTIONS.includes(currentSection)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      linesInSection++;
      if (linesInSection > 3) continue;

      const lineTokens = estimateTokens(trimmed);
      if (usedTokens + lineTokens > maxTokens) break;

      result.push(trimmed);
      usedTokens += lineTokens;
    }
  }

  return result.join("\n");
}

export function extractSectionLines(
  content: string,
  sectionName: string,
  maxLines: number,
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inSection = false;
  let lineCount = 0;

  for (const line of lines) {
    if (new RegExp(`^#{1,3}\\s+${sectionName}`).test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s+/.test(line)) {
      break;
    }
    if (inSection) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      result.push(trimmed);
      lineCount++;
      if (lineCount >= maxLines) break;
    }
  }

  return result.join("\n");
}

export function extractSceneSummary(sceneContent: string): string {
  const sectionContent = extractSectionLines(sceneContent, "经过", 5);
  if (sectionContent) return sectionContent;

  const lines = sceneContent.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(">")) continue;
    result.push(trimmed);
    if (result.length >= 5) break;
  }
  return result.join("\n");
}

export function extractCharactersInScene(sceneContent: string): string[] {
  const lines = sceneContent.split("\n");
  const characters: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (/^#{2,3}\s+在场角色/.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection && /^#{1,3}\s+/.test(line)) {
      inSection = false;
      continue;
    }

    if (inSection) {
      const listMatch = line.match(
        /^-\s+(?:\*\*)?([^,*\s\[][^,*]*?)(?:\*\*)?\s*(?:\[.*)?$/,
      );
      if (listMatch) {
        characters.push(listMatch[1].trim());
      }
    }
  }

  return characters;
}

export function extractLocationFromWorld(
  worldContent: string,
  locationName: string,
): string {
  const lines = worldContent.split("\n");
  let inLocationSection = false;
  let foundLocation = false;
  const result: string[] = [];

  for (const line of lines) {
    if (/^#{2,3}\s+地点/.test(line)) {
      inLocationSection = true;
      continue;
    }

    if (inLocationSection && /^##\s+/.test(line) && !/^###\s+/.test(line)) {
      inLocationSection = false;
      continue;
    }

    if (inLocationSection) {
      const locMatch = line.match(/^###\s+(.+)/);
      if (locMatch) {
        if (foundLocation) {
          break;
        }
        const locName = locMatch[1].trim();
        if (
          locName === locationName ||
          locName.includes(locationName) ||
          locationName.includes(locName)
        ) {
          foundLocation = true;
          continue;
        }
        continue;
      }

      if (foundLocation) {
        const trimmed = line.trim();
        if (trimmed) result.push(trimmed);
      }
    }
  }

  return result.join("\n");
}

export function extractSceneLocation(sceneContent: string): string {
  return extractSectionLines(sceneContent, "地点", 1);
}

export async function findLatestScene(dir: string): Promise<string | null> {
  const entries = await globNovelFiles(dir, "scenes");
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const numA = parseInt(a, 10) || 0;
    const numB = parseInt(b, 10) || 0;
    return numB - numA;
  });

  return entries[0];
}
