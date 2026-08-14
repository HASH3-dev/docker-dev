import { existsSync } from "node:fs";
import {
  appendFile,
  lstat,
  mkdir,
  readlink,
  realpath,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { CommandContext } from "./context";
import { run } from "./process";

const direnvHookStart = "# >>> docker-dev direnv hook >>>";
const direnvHookEnd = "# <<< docker-dev direnv hook <<<";
const gitignoreRuleStart = "# >>> docker-dev managed .envrc >>>";
const gitignoreRuleEnd = "# <<< docker-dev managed .envrc <<<";
const dockerDevGitignoreRuleStart = "# >>> docker-dev managed local files >>>";
const dockerDevGitignoreRuleEnd = "# <<< docker-dev managed local files <<<";
const dockerDevLocalFiles = ["docker-dev", ".docker-dev-state.json"] as const;

function commandExists(command: string): boolean {
  return Bun.which(command) !== null;
}

function homeDirectory(): string {
  const home = process.env.HOME;

  if (!home) {
    throw new Error("Could not determine the host home directory.");
  }

  return home;
}

async function runPrivileged(
  context: CommandContext,
  command: string[],
): Promise<void> {
  if (process.getuid?.() === 0) {
    await run(context, command);
    return;
  }

  if (!commandExists("sudo")) {
    throw new Error(
      `Administrative privileges are required to run: ${command.join(" ")}`,
    );
  }

  await run(context, ["sudo", ...command]);
}

export async function installDirenv(context: CommandContext): Promise<void> {
  if (commandExists("direnv")) {
    pLog("direnv is already installed on the host.");
    return;
  }

  pLog("direnv was not found; installing it on the host.");

  if (process.platform === "darwin") {
    if (!commandExists("brew")) {
      throw new Error(
        "Homebrew is required to install direnv automatically on macOS.",
      );
    }

    await run(context, ["brew", "install", "direnv"]);
  } else if (process.platform === "linux") {
    if (commandExists("apt-get")) {
      await runPrivileged(context, ["apt-get", "update"]);
      await runPrivileged(context, ["apt-get", "install", "-y", "direnv"]);
    } else if (commandExists("dnf")) {
      await runPrivileged(context, ["dnf", "install", "-y", "direnv"]);
    } else if (commandExists("pacman")) {
      await runPrivileged(context, [
        "pacman",
        "-Sy",
        "--needed",
        "--noconfirm",
        "direnv",
      ]);
    } else if (commandExists("apk")) {
      await runPrivileged(context, ["apk", "add", "direnv"]);
    } else if (commandExists("zypper")) {
      await runPrivileged(context, [
        "zypper",
        "--non-interactive",
        "install",
        "direnv",
      ]);
    } else {
      throw new Error(
        "No supported Linux package manager was found to install direnv.",
      );
    }
  } else {
    throw new Error(
      `Automatic direnv installation is not supported on ${process.platform}.`,
    );
  }

  if (!commandExists("direnv")) {
    throw new Error(
      "direnv installation completed but the command is not available in PATH.",
    );
  }
}

function pLog(message: string): void {
  // Kept in the host layer so setup can report each host-side action consistently.
  process.stderr.write(`${message}\n`);
}

export async function enableDirenvHook(): Promise<void> {
  const shell = basename(process.env.SHELL ?? "bash");
  const home = homeDirectory();
  const configurations: Record<string, { file: string; hook: string }> = {
    bash: { file: join(home, ".bashrc"), hook: 'eval "$(direnv hook bash)"' },
    zsh: { file: join(home, ".zshrc"), hook: 'eval "$(direnv hook zsh)"' },
    fish: {
      file: join(home, ".config", "fish", "config.fish"),
      hook: "direnv hook fish | source",
    },
  };
  const configuration = configurations[shell];

  if (!configuration) {
    throw new Error(
      `Unsupported shell '${shell}'. Enable its direnv hook manually, then rerun setup.`,
    );
  }

  const current = existsSync(configuration.file)
    ? await Bun.file(configuration.file).text()
    : "";

  if (current.includes(direnvHookStart)) {
    pLog(`The direnv hook is already configured in ${configuration.file}.`);
    return;
  }

  await mkdir(dirname(configuration.file), { recursive: true });
  await appendFile(
    configuration.file,
    `\n${direnvHookStart}\n${configuration.hook}\n${direnvHookEnd}\n`,
  );
  pLog(`Added the managed direnv hook to ${configuration.file}.`);
}

export async function ensureManagedEnvrc(
  context: CommandContext,
): Promise<void> {
  const envrc = join(context.projectRoot, ".envrc");

  if (existsSync(envrc)) {
    const isManaged =
      (await readlink(envrc).catch(() => "")) === ".docker-dev/direnv.envrc";

    if (!isManaged) {
      throw new Error(
        `Refusing to replace the existing ${envrc}. Add 'source_env .docker-dev/direnv.envrc' to it, then run 'direnv allow'.`,
      );
    }
  } else {
    await symlink(".docker-dev/direnv.envrc", envrc);
    pLog("Created the managed .envrc entrypoint.");
  }

  const gitignore = join(context.projectRoot, ".gitignore");
  const contents = existsSync(gitignore)
    ? await Bun.file(gitignore).text()
    : "";

  if (
    !contents.includes(gitignoreRuleStart) &&
    !contents.split("\n").includes(".envrc")
  ) {
    const separator =
      contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
    await appendFile(
      gitignore,
      `${separator}${gitignoreRuleStart}\n.envrc\n${gitignoreRuleEnd}\n`,
    );
    pLog("Added the managed .envrc rule to .gitignore.");
  }
}

export async function allowManagedDirenv(
  context: CommandContext,
): Promise<void> {
  if (!commandExists("direnv")) {
    return;
  }

  const envrc = join(context.projectRoot, ".envrc");

  if ((await readlink(envrc).catch(() => "")) === ".docker-dev/direnv.envrc") {
    await run(context, ["direnv", "allow", envrc]);
  }
}

/** Links the project-local entrypoint to the executable that ran setup. */
export async function ensureProjectExecutable(
  dockerDevDirectory: string,
  extraIgnoredPaths: readonly string[] = [],
): Promise<void> {
  await mkdir(dockerDevDirectory, { recursive: true });
  await ensureProjectExecutableIsIgnored(dockerDevDirectory, extraIgnoredPaths);

  const link = join(dockerDevDirectory, "docker-dev");
  const executable = await realpath(process.execPath);

  try {
    const stat = await lstat(link);

    if (!stat.isSymbolicLink()) {
      throw new Error(`Refusing to replace the existing ${link}.`);
    }

    if ((await readlink(link)) === executable) {
      return;
    }

    await unlink(link);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  await symlink(executable, link);
  pLog("Created the project-local docker-dev executable link.");
}

async function ensureProjectExecutableIsIgnored(
  dockerDevDirectory: string,
  extraIgnoredPaths: readonly string[],
): Promise<void> {
  const gitignore = join(dockerDevDirectory, ".gitignore");
  const contents = existsSync(gitignore)
    ? await Bun.file(gitignore).text()
    : "";
  const ignoredPaths = [...dockerDevLocalFiles, ...extraIgnoredPaths];
  const managedRule = `${dockerDevGitignoreRuleStart}\n${ignoredPaths.join("\n")}\n${dockerDevGitignoreRuleEnd}`;

  if (contents.includes(dockerDevGitignoreRuleStart)) {
    const start = contents.indexOf(dockerDevGitignoreRuleStart);
    const end = contents.indexOf(dockerDevGitignoreRuleEnd, start);

    if (end === -1) {
      throw new Error(`Invalid managed section in ${gitignore}.`);
    }

    const endOfRule = end + dockerDevGitignoreRuleEnd.length;
    const updated = `${contents.slice(0, start)}${managedRule}${contents.slice(endOfRule)}`;

    if (updated !== contents) {
      await writeFile(gitignore, updated);
      pLog("Updated docker-dev local files in .docker-dev/.gitignore.");
    }
    return;
  }

  const separator = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  await appendFile(gitignore, `${separator}${managedRule}\n`);
  pLog("Added docker-dev local files to .docker-dev/.gitignore.");
}
