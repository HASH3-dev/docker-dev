import manifest from "./command.json";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("runUvWrapper", async (context, args) => {
    const [relativePath, ...uvArgs] = args;

    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..")) {
      throw new Error("The uv working path must stay within the project.");
    }

    await start(context);

    await execInDev(context, ["--workdir", `/workspace/${relativePath}`, "dev", "uv", ...uvArgs]);
  });
}
