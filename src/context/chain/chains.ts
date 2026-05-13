import type { ContextHandler } from "./types";
import { SceneProgressHandler } from "./handlers/scene-progress";
import { PreviousSceneHandler } from "./handlers/previous-scene";
import { SceneContextHandler } from "./handlers/scene-context";
import { SceneLocationHandler } from "./handlers/scene-location";
import { CharacterL0Handler } from "./handlers/character-l0";
import { OtherCharacterL0Handler } from "./handlers/other-character-l0";
import { CharacterL1Handler } from "./handlers/character-l1";
import { CharacterFileHandler } from "./handlers/character-file";
import { PlotDirectionHandler } from "./handlers/plot-direction";
import { DirectivesHandler } from "./handlers/directives";
import { InteractionLogHandler } from "./handlers/interaction-log";
import { StyleGuideHandler } from "./handlers/style-guide";
import { FileDirectoryHandler } from "./handlers/file-directory";

export function createGMChain(): ContextHandler {
  const chain = new SceneProgressHandler();
  chain.setNext(new PreviousSceneHandler())
    .setNext(new CharacterL0Handler())
    .setNext(new SceneContextHandler())
    .setNext(new SceneLocationHandler())
    .setNext(new OtherCharacterL0Handler())
    .setNext(new PlotDirectionHandler())
    .setNext(new CharacterL1Handler())
    .setNext(new DirectivesHandler())
    .setNext(new FileDirectoryHandler());
  return chain;
}

export function createActorChain(): ContextHandler {
  const chain = new CharacterFileHandler();
  chain.setNext(new PreviousSceneHandler())
    .setNext(new CharacterL0Handler())
    .setNext(new SceneContextHandler())
    .setNext(new SceneLocationHandler())
    .setNext(new CharacterL1Handler())
    .setNext(new DirectivesHandler())
    .setNext(new InteractionLogHandler());
  return chain;
}

export function createScribeChain(): ContextHandler {
  const chain = new StyleGuideHandler();
  chain.setNext(new CharacterL0Handler())
    .setNext(new SceneContextHandler())
    .setNext(new SceneLocationHandler())
    .setNext(new DirectivesHandler())
    .setNext(new InteractionLogHandler());
  return chain;
}

export function createArchivistChain(): ContextHandler {
  const chain = new CharacterL0Handler();
  chain.setNext(new SceneContextHandler())
    .setNext(new SceneLocationHandler())
    .setNext(new DirectivesHandler());
  return chain;
}