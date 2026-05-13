import { Agent } from "@openai/agents";
import { getModel, getModelSettings } from "@/lib/models";
import { readFileTool, writeFileTool, editFileTool, globFilesTool } from "@/tools/file-tools";
import { resolveCharacterTool, listCharactersTool } from "@/tools/character-tools";
import { getArchivistSubPrompt } from "@/prompts/archivist-sub";
import type { ArchivistResponsibility } from "./types";

function makeInstructions(resp: ArchivistResponsibility) {
  return async () => {
    return getArchivistSubPrompt(resp, {});
  };
}

const archivistSettings = getModelSettings("archivist");

export function createCharactersAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-characters",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("characters"),
    tools: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool, listCharactersTool],
  });
}

export function createSceneAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-scene",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("scene"),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createWorldAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-world",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("world"),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createPlotAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-plot",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("plot"),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createTimelineAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-timeline",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("timeline"),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createDebtsAgent(_storyDir: string): Agent {
  return new Agent({
    name: "archivist-debts",
    model: getModel("archivist"),
    modelSettings: archivistSettings,
    instructions: makeInstructions("debts"),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}
