import { globNovelFiles, readNovelFile } from "@/store/story-files";
import { extractL0 } from "./extract";

export async function findCharacterByName(
  dir: string,
  name: string,
): Promise<string | null> {
  const entries = await globNovelFiles(dir, "characters");
  if (entries.length === 0) return null;

  const stems = entries.map((e) => e.replace("characters/", "").replace(".md", ""));

  const exactMatch = stems.find((s) => s === name);
  if (exactMatch) return name;

  for (const stem of stems) {
    if (stem.includes(name) || name.includes(stem)) return stem;
  }

  for (const entry of entries) {
    const content = await readNovelFile(dir, entry);
    if (!content) continue;
    const l0 = extractL0(content);
    if (l0 && l0.includes(name)) return entry.replace("characters/", "").replace(".md", "");
  }

  return null;
}

export async function listAllCharacters(
  dir: string,
): Promise<{ name: string; l0: string }[]> {
  const entries = await globNovelFiles(dir, "characters");
  if (entries.length === 0) return [];

  const result: { name: string; l0: string }[] = [];
  for (const entry of entries) {
    const content = await readNovelFile(dir, entry);
    if (!content) continue;
    const l0 = extractL0(content);
    result.push({ name: entry.replace("characters/", "").replace(".md", ""), l0: l0 || "" });
  }
  return result;
}
