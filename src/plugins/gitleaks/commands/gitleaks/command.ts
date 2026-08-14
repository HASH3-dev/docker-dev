import { mkdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { pluginOutputPath, readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";
import { ensureDockerignoreEntry } from "@lib/host";

interface GitleaksConfig {
  mode: "git" | "dir";
}

export function register(registry: ActionRegistry): void {
  registry.register("scanGitleaksPath", async (context, args) => {
    if (args.length > 1) {
      throw new Error("gitleaks accepts at most one path.");
    }

    const config = await readPluginConfig<GitleaksConfig>(
      context.dockerDevDirectory,
      "plugins/gitleaks",
    );
    const outputPath = await pluginOutputPath(
      context.dockerDevDirectory,
      "plugins/gitleaks",
    );

    if (!config || !outputPath) {
      throw new Error("The gitleaks plugin is not selected in this project.");
    }

    await ensureDockerignoreEntry(context.dockerDevDirectory, "reports/gitleaks.json");
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
