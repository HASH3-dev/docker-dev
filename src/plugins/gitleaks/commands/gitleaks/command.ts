import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

interface GitleaksConfig {
  mode: "git" | "dir";
}

export function register(registry: ActionRegistry): void {
  registry.register("scanGitleaksPath", async (context, args, manifest) => {
    if (args.length > 1) {
      throw new Error("gitleaks accepts at most one path.");
    }

    const config = await readPluginConfig<GitleaksConfig>(
      context.dockerDevDirectory,
      "plugins/gitleaks",
    );
    const outputPath = manifest?.output
      ? join(context.dockerDevDirectory, manifest.output.file)
      : undefined;

    if (!config || !outputPath) {
      throw new Error("The gitleaks plugin is not selected in this project.");
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "gitleaks",
      config.mode,
      "--report-format",
      "json",
      "--report-path",
      containerOutputPath,
      args[0] ?? ".",
    ]);
  });
}
