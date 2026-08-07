import { resolve } from "node:path";

export interface CommandContext {
  readonly projectRoot: string;
  readonly dockerDevDirectory: string;
  readonly interactive: boolean;
  readonly commandArguments: readonly string[];
  readonly commandOptions: Readonly<Record<string, unknown>>;
}

export function createContext(
  commandArguments: readonly string[],
  commandOptions: Readonly<Record<string, unknown>> = {},
): CommandContext {
  const projectRoot = process.cwd();
  return {
    projectRoot,
    dockerDevDirectory: resolve(projectRoot, ".docker-dev"),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    commandArguments,
    commandOptions,
  };
}
