import type { ContextHandler, ContextRequest, ContextResult } from "./types";

/**
 * 上下文处理器抽象基类。
 *
 * 子类只需实现 doHandle()，链式传递由基类自动处理。
 * 每个处理器产出自己的 ContextMessage[]，合并 accumulatedMessages 后传递给下游。
 */
export abstract class BaseContextHandler implements ContextHandler {
  private nextHandler: ContextHandler | null = null;

  setNext(handler: ContextHandler): ContextHandler {
    this.nextHandler = handler;
    return handler;
  }

  async handle(request: ContextRequest): Promise<ContextResult> {
    // 1. 当前处理器产出消息
    const result = await this.doHandle(request);

    // 2. 合并到累积消息中，传递给下游
    const updatedRequest: ContextRequest = {
      ...request,
      accumulatedMessages: [
        ...request.accumulatedMessages,
        ...result.messages,
      ],
    };

    // 3. 传递给下一个处理器
    if (this.nextHandler) {
      const nextResult = await this.nextHandler.handle(updatedRequest);
      return {
        messages: [...result.messages, ...nextResult.messages],
      };
    }

    return result;
  }

  /** 子类实现：产出自己的上下文消息。返回空数组表示该处理器不产出消息。 */
  protected abstract doHandle(request: ContextRequest): Promise<ContextResult>;
}