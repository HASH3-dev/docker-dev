import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { pluginOutputPath, readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";
import { ensureDockerignoreEntry } from "@lib/host";

interface SemgrepConfig {
  config: string;
  severity: string[];
  metricsOff: boolean;
}

export function register(registry: ActionRegistry): void {
  registry.register("scanSemgrepPath", async (context, args) => {
    if (args.length > 1) {
      throw new Error("semgrep accepts at most one path.");
    }

    const config = await readPluginConfig<SemgrepConfig>(
      context.dockerDevDirectory,
      "plugins/semgrep",
    );
    const outputPath = await pluginOutputPath(
      context.dockerDevDirectory,
      "plugins/semgrep",
    );

    if (!config || !outputPath) {
      throw new Error("The semgrep plugin is not selected in this project.");
    }

    await ensureDockerignoreEntry(context.dockerDevDirectory, "reports/semgrep.json");
    await mkdir(dirname(outputPath), { recursive: true });
    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "semgrep",
      "scan",
      "--metrics",
      config.metricsOff ? "off" : "auto",
      "--config",
      config.config,
      ...config.severity.flatMap((severity) => ["--severity", severity]),
      "--json",
      "--output",
      containerOutputPath,
      "--error",
      args[0] ?? ".",
    ]);
  });
}
