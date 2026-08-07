import manifest from "./command.json";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { materializeAssets } from "@internal/assets";
import { configurePlugins, prunePlugins } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import {
  allowManagedDirenv,
  enableDirenvHook,
  ensureProjectExecutable,
  ensureManagedEnvrc,
  installDirenv,
} from "@lib/host";
import { installAsdfTools } from "@lib/asdf";
import { parsePortList } from "@lib/ports";
import { run } from "@lib/process";
import { start, runPluginHook } from "@lib/compose";
export default manifest;

async function configuredRuntimes(projectRoot: string): Promise<string[]> {
  try {
    return (await Bun.file(join(projectRoot, ".tool-versions")).text())
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/\s+/, 1)[0])
      .filter((runtime): runtime is string => Boolean(runtime));
  } catch {
    return [];
  }
}

async function configureToolVersions(projectRoot: string): Promise<string[]> {
  const toolVersions = join(projectRoot, ".tool-versions");

  if (existsSync(toolVersions)) {
    return configuredRuntimes(projectRoot);
  }

  p.log.info(
    "No .tool-versions was found. Add the runtimes used by this project.",
  );

  const entries: string[] = [];
  let addAnother = true;

  while (addAnother) {
    const name = await p.text({
      message: "Language or runtime",
      placeholder: "nodejs",
      validate: (value) =>
        /^[A-Za-z0-9._-]+$/.test(value ?? "")
          ? undefined
          : "Use a non-empty asdf plugin name.",
    });

    if (p.isCancel(name)) {
      throw new Error("Runtime selection cancelled.");
    }

    const version = await p.text({
      message: `Version for ${name}`,
      placeholder: "22.0.0",
      validate: (value) =>
        value && !/\s/.test(value)
          ? undefined
          : "Use one non-empty version without spaces.",
    });

    if (p.isCancel(version)) {
      throw new Error("Runtime selection cancelled.");
    }

    entries.push(`${name} ${version}`);

    const answer = await p.confirm({
      message: "Add another runtime?",
      initialValue: false,
    });

    if (p.isCancel(answer)) {
      throw new Error("Runtime selection cancelled.");
    }

    addAnother = answer;
  }

  await writeFile(toolVersions, `${entries.join("\n")}\n`);
  return entries
    .map((entry) => entry.split(/\s+/, 1)[0])
    .filter((runtime): runtime is string => Boolean(runtime));
}

async function configuredPortValue(
  dockerDevDirectory: string,
): Promise<string> {
  try {
    const value = await Bun.file(join(dockerDevDirectory, "ports.env")).text();
    const configured = value
      .split("\n")
      .find((line) => line.startsWith("DOCKER_DEV_PORTS="))
      ?.slice("DOCKER_DEV_PORTS=".length);

    return configured ? parsePortList(configured).join(",") : "3000";
  } catch {
    return "3000";
  }
}

async function configurePorts(dockerDevDirectory: string): Promise<void> {
  const current = await configuredPortValue(dockerDevDirectory);

  p.note(
    "Development ports are published only to localhost. Use commas for multiple ports and host:container to avoid conflicts.\nExample: 3000,3002:3001,5173",
    "Published ports",
  );

  const answer = await p.text({
    message: "Ports to expose",
    initialValue: current,
    validate: (value) => {
      try {
        parsePortList(value ?? "");
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "Invalid port configuration.";
      }
    },
  });

  if (p.isCancel(answer)) {
    throw new Error("Port configuration cancelled.");
  }

  const ports = parsePortList(answer).join(",");
  await writeFile(
    join(dockerDevDirectory, "ports.env"),
    [
      "# Comma-separated host:container mappings published only on localhost.",
      "# A plain port maps to itself. Example: DOCKER_DEV_PORTS=3000,3002:3001,5173",
      `DOCKER_DEV_PORTS=${ports}`,
      "",
    ].join("\n"),
  );
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

    p.intro("docker-dev setup");
    p.note(
      [
        "This setup may modify the host machine:",
        "- install direnv with the host package manager when it is missing;",
        "- add one managed direnv hook to your shell startup file;",
        "- create and authorize the project .envrc entrypoint;",
        "- create .tool-versions when the project does not have one.",
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

    await materializeAssets(context.dockerDevDirectory);

    await ensureProjectExecutable(context.dockerDevDirectory);

    await configurePorts(context.dockerDevDirectory);

    const runtimes = await configureToolVersions(context.projectRoot);

    await configurePlugins(
      context.dockerDevDirectory,
      context.projectRoot,
      runtimes,
    );

    await prunePlugins(context.dockerDevDirectory);

    await installDirenv(context);

    await enableDirenvHook();

    await ensureManagedEnvrc(context);

    await allowManagedDirenv(context);

    await run(context, ["docker", "compose", "version"]);

    await start(context);

    await installAsdfTools(context);

    await runPluginHook(context, "post-asdf");

    p.outro(
      "docker-dev is ready. Open a new terminal to load the direnv hook.",
    );

    await startFreshShell(context.projectRoot);
  });
}
