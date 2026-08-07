import manifest from "./command.json";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("scanTrivyPath", async (context, args) => {
    if (args.length > 1) {
      throw new Error("scan accepts at most one path.");
    }

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "docker-dev-trivy-gate",
      "scan-path",
      args[0] ?? ".",
    ]);
  });
}
