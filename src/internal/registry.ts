import type { CommandManifest } from "../schemas/manifest";
import type { CommandContext } from "@lib/context";

export type ActionHandler = (
  context: CommandContext,
  args: readonly string[],
  manifest?: CommandManifest,
) => Promise<void>;

export class ActionRegistry {
  readonly #handlers = new Map<string, ActionHandler>();

  register(name: string, handler: ActionHandler): void {
    if (this.#handlers.has(name)) {
      throw new Error(`Action handler collision: ${name}`);
    }
    this.#handlers.set(name, handler);
  }

  get(name: string): ActionHandler {
    const handler = this.#handlers.get(name);
    if (!handler) {
      throw new Error(`Action handler is not registered: ${name}`);
    }
    return handler;
  }

  has(name: string): boolean {
    return this.#handlers.has(name);
  }
}
