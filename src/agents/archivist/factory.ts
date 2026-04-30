import { Agent } from "@openai/agents";
import { getModel } from "@/lib/models";
import { readFileTool, writeFileTool, editFileTool, globFilesTool } from "@/tools/file-tools";
import { resolveCharacterTool, listCharactersTool } from "@/tools/character-tools";
import { getArchivistSubPrompt } from "@/prompts/archivist-sub";
import { buildStoryContext } from "@/context/build-story-context";
import type { ArchivistResponsibility } from "./types";

function makeInstructions(resp: ArchivistResponsibility, storyDir: string) {
  return async () => {
    const storyContext = await buildStoryContext(storyDir);
    return getArchivistSubPrompt(resp, {
      storyContext: storyContext ?? undefined,
    });
  };
}

export function createCharactersAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-characters",
    model: getModel("archivist"),
    instructions: makeInstructions("characters", storyDir),
    tools: [readFileTool, writeFileTool, editFileTool, globFilesTool, resolveCharacterTool, listCharactersTool],
  });
}

export function createSceneAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-scene",
    model: getModel("archivist"),
    instructions: makeInstructions("scene", storyDir),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createWorldAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-world",
    model: getModel("archivist"),
    instructions: makeInstructions("world", storyDir),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createPlotAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-plot",
    model: getModel("archivist"),
    instructions: makeInstructions("plot", storyDir),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createTimelineAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-timeline",
    model: getModel("archivist"),
    instructions: makeInstructions("timeline", storyDir),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}

export function createDebtsAgent(storyDir: string): Agent {
  return new Agent({
    name: "archivist-debts",
    model: getModel("archivist"),
    instructions: makeInstructions("debts", storyDir),
    tools: [readFileTool, editFileTool, globFilesTool],
  });
}
