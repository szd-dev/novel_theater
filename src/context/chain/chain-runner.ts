import type { AgentInputItem, Session } from "@openai/agents";
import type { ContextRole, ContextRequest, ContextMessage } from "./types";
import type { ArchivistResponsibility } from "@/agents/archivist/types";
import {
  createGMChain,
  createActorChain,
  createScribeChain,
  createArchivistChain,
} from "./chains";

const SENTINEL_PREFIX = "[CONTEXT:";

async function findContextSentinel(
  session: Session,
  role: string,
): Promise<string | null> {
  const items = await session.getItems();
  const prefix = `${SENTINEL_PREFIX}${role}:`;

  for (const item of items) {
    const i = item as Record<string, unknown>;
    if (i.role === "user" && typeof i.content === "string") {
      const text = (i.content as string).trim();
      if (text.startsWith(prefix)) {
        return text;
      }
    }
  }
  return null;
}

async function shouldInject(
  session: Session,
  role: string,
  version: string,
): Promise<boolean> {
  const existing = await findContextSentinel(session, role);
  if (!existing) return true;

  const expectedSentinel = `${SENTINEL_PREFIX}${role}:${version}]`;
  return existing !== expectedSentinel;
}

function getChainForRole(role: ContextRole) {
  if (role === "gm") return createGMChain();
  if (role === "actor") return createActorChain();
  if (role === "scribe") return createScribeChain();
  return createArchivistChain();
}

function buildContextRequest(params: {
  role: ContextRole;
  storyDir: string;
  runContext: Record<string, unknown>;
  characterName?: string;
  characterFile?: string;
  styleGuide?: string;
  responsibility?: ArchivistResponsibility;
}): ContextRequest {
  return {
    storyDir: params.storyDir,
    role: params.role,
    runContext: params.runContext,
    accumulatedMessages: [],
    characterName: params.characterName,
    characterFile: params.characterFile,
    styleGuide: params.styleGuide,
    responsibility: params.responsibility,
    _cache: new Map(),
  };
}

export interface AssembleResult {
  messages: ContextMessage[];
  injected: boolean;
}

export async function assembleAndInject(params: {
  role: ContextRole;
  storyDir: string;
  runContext: Record<string, unknown>;
  session?: Session;
  version?: string;
  characterName?: string;
  characterFile?: string;
  styleGuide?: string;
  responsibility?: ArchivistResponsibility;
}): Promise<AssembleResult> {
  const chain = getChainForRole(params.role);
  const request = buildContextRequest(params);
  const result = await chain.handle(request);

  if (!params.session) {
    return { messages: result.messages, injected: true };
  }

  const version = params.version ?? "v1";
  if (!(await shouldInject(params.session, params.role, version))) {
    return { messages: [], injected: false };
  }

  const sentinel: AgentInputItem = {
    role: "user",
    content: `${SENTINEL_PREFIX}${params.role}:${version}]`,
  } as unknown as AgentInputItem;

  const contextItems: AgentInputItem[] = [
    sentinel,
    ...result.messages.map((msg) =>
      ({
        role: "user",
        content: `## ${msg.label}\n${msg.content}`,
      }) as unknown as AgentInputItem,
    ),
  ];
  await params.session.addItems(contextItems);

  return { messages: result.messages, injected: true };
}