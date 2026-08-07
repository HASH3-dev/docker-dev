import manifest from "./command.json";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("runYarnWrapper", async (context, args) => {
    const [relativePath, ...yarnArgs] = args;

    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..")) {
      throw new Error("The yarn working path must stay within the project.");
    }

    await start(context);

    await execInDev(context, ["--workdir", `/workspace/${relativePath}`, "dev", "yarn", ...yarnArgs]);
  });
}
