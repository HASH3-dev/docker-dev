import manifest from "./command.json";
import * as p from "@clack/prompts";
import { writeFile } from "node:fs/promises";
import { materializeAssets } from "@internal/assets";
import { collectSelectedPluginOutputPaths, planPlugins } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import {
  allowManagedDirenv,
  enableDirenvHook,
  ensureProjectExecutable,
  ensureManagedEnvrc,
  installDirenv,
} from "@lib/host";
import { installAsdfTools } from "@lib/asdf";
import { run } from "@lib/process";
import { start, runPluginHook } from "@lib/compose";
import { planPorts, planToolVersions, planVersionFile } from "./plan";
import { requireMatchingVersion } from "@lib/update";
export default manifest;

const freshShellEnvironmentKey = "DOCKER_DEV_FRESH_SHELL";

export function shouldStartFreshShell(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment[freshShellEnvironmentKey] !== "1";
}

async function startFreshShell(projectRoot: string): Promise<void> {
  const shell = process.env.SHELL ?? "/bin/bash";

  p.log.info("Press any key to start a fresh shell with docker-dev enabled.");

  await new Promise<void>((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.once("data", () => {
      stdin.setRawMode?.(false);
      stdin.pause();
      resolve();
    });
  });

  const shellProcess = Bun.spawn([shell, "-l"], {
    cwd: projectRoot,
    env: { ...process.env, [freshShellEnvironmentKey]: "1" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await shellProcess.exited;

  if (code !== 0) {
    throw new Error(`${shell} exited with code ${code}`);
  }
}

export function register(registry: ActionRegistry): void {
  registry.register("prepareSetup", async (context) => {
    if (!context.interactive) {
      throw new Error("Setup requires an interactive terminal.");
    }

    const force = context.commandOptions.force === true;

    p.intro("docker-dev setup");
    p.note(
      [
        "This setup may modify the host machine:",
        "- install direnv with the host package manager when it is missing;",
        "- add one managed direnv hook to your shell startup file;",
        "- create and authorize the project .envrc entrypoint;",
        force
          ? "- reconfigure .tool-versions, ports and plugin selection from scratch;"
          : "- create .tool-versions when the project does not have one;",
        "- create .docker-dev-version when the project does not have one.",
        "\nNo application source code is changed.",
      ].join("\n"),
      "Host changes",
    );

    const ok = await p.confirm({
      message: "Apply these changes?",
      initialValue: false,
    });

    if (p.isCancel(ok) || !ok) {
      throw new Error("Setup cancelled.");
    }

    await requireMatchingVersion(context.projectRoot);

    // Collection phase: prompts and reads only. Nothing is written to disk
    // yet, so a cancellation here leaves the project untouched.
    const versionFilePlan = planVersionFile(context.projectRoot);
    const ports = await planPorts(context.dockerDevDirectory, force);
    const toolVersionsPlan = await planToolVersions(context.projectRoot, force);
    const pluginSelections = await planPlugins(
      context.dockerDevDirectory,
      context.projectRoot,
      toolVersionsPlan.runtimes,
      force,
    );

    // Application phase: everything above is already decided, so this is the
    // only place that writes to disk.
    await materializeAssets(context.dockerDevDirectory, {
      ports,
      pluginSelections,
    });
    await ensureProjectExecutable(
      context.dockerDevDirectory,
      await collectSelectedPluginOutputPaths(context.dockerDevDirectory),
    );

    if (toolVersionsPlan.write) {
      await writeFile(
        toolVersionsPlan.write.path,
        toolVersionsPlan.write.content,
      );
    }

    if (versionFilePlan) {
      await writeFile(versionFilePlan.path, versionFilePlan.content);
    }

    await installDirenv(context);

    await enableDirenvHook();

    await ensureManagedEnvrc(context);

    await allowManagedDirenv(context);

    await run(context, ["docker", "compose", "version"]);

    await start(context);

    await installAsdfTools(context);

    await runPluginHook(context, "post-asdf");

    if (shouldStartFreshShell()) {
      p.outro("docker-dev is ready. Starting a fresh shell with direnv enabled.");
      await startFreshShell(context.projectRoot);
    } else {
      p.outro("docker-dev is ready. The current fresh shell will reload direnv at its next prompt.");
    }
  });
}
