import manifest from "./command.json";
import { relative, resolve } from "node:path";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("runSecretsWrapper", async (context, args) => {
    const envFile = context.commandOptions.envFile;
    const environment = context.commandOptions.environment;

    const hasEnvFile = typeof envFile === "string" && envFile.length > 0;
    const hasEnvironment = typeof environment === "string" && environment.length > 0;

    if (!hasEnvFile && !hasEnvironment) {
      throw new Error("Provide --env-file <path> and/or --environment <id>.");
    }

    const wrapperArgs = ["dev", "docker-dev-secrets"];

    if (hasEnvironment) {
      wrapperArgs.push("--environment", environment);
    }

    if (hasEnvFile) {
      const relativePath = relative(
        context.projectRoot,
        resolve(context.projectRoot, envFile),
      );

      if (!relativePath || relativePath.startsWith("..") || relativePath.startsWith("/")) {
        throw new Error("The env file must stay within the project.");
      }

      wrapperArgs.push("--env-file", `/workspace/${relativePath}`);
    }

    await start(context);
    await execInDev(context, [...wrapperArgs, ...args]);
  });
}
