import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

interface SemgrepConfig {
  config: string;
  severity: string[];
  metricsOff: boolean;
}

export function register(registry: ActionRegistry): void {
  registry.register("scanSemgrepPath", async (context, args, manifest) => {
    if (args.length > 1) {
      throw new Error("semgrep accepts at most one path.");
    }

    const config = await readPluginConfig<SemgrepConfig>(
      context.dockerDevDirectory,
      "plugins/semgrep",
    );
    const outputPath = manifest?.output
      ? join(context.dockerDevDirectory, manifest.output.file)
      : undefined;

    if (!config || !outputPath) {
      throw new Error("The semgrep plugin is not selected in this project.");
    }

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
