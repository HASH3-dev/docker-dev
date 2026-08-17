import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import manifest from "./command.json";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("scanTrivyPath", async (context, args, command) => {
    if (args.length > 1) {
      throw new Error("scan accepts at most one path.");
    }

    const outputPath = command?.output
      ? join(context.dockerDevDirectory, command.output.file)
      : undefined;
    if (!outputPath) {
      throw new Error("The trivy scan command declares no output file.");
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "docker-dev-trivy-gate",
      "scan-path",
      args[0] ?? ".",
      containerOutputPath,
    ]);
  });
}
