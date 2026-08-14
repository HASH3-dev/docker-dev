import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { pluginOutputPath, readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";
import { ensureDockerignoreEntry } from "@lib/host";

interface BearerConfig {
  failOnSeverity: string[];
}

export function register(registry: ActionRegistry): void {
  registry.register("scanBearerPath", async (context, args) => {
    if (args.length > 1) {
      throw new Error("bearer accepts at most one path.");
    }

    const config = await readPluginConfig<BearerConfig>(
      context.dockerDevDirectory,
      "plugins/bearer",
    );
    const outputPath = await pluginOutputPath(
      context.dockerDevDirectory,
      "plugins/bearer",
    );

    if (!config || !outputPath) {
      throw new Error("The bearer plugin is not selected in this project.");
    }

    await ensureDockerignoreEntry(context.dockerDevDirectory, "reports/bearer.json");
    await mkdir(dirname(outputPath), { recursive: true });
    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "bearer",
      "scan",
      "--format",
      "json",
      "--output",
      containerOutputPath,
      "--fail-on-severity",
      config.failOnSeverity.join(","),
      args[0] ?? ".",
    ]);
  });
}
