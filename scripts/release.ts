import * as p from "@clack/prompts";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type PackageManifest = Record<string, unknown> & { version?: unknown };

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

async function gitOutput(args: string[]): Promise<string> {
  const child = Bun.spawn(["git", ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args.join(" ")} failed.`);
  }

  return stdout.trim();
}

async function runGit(args: string[]): Promise<void> {
  const child = Bun.spawn(["git", ...args], {
    cwd: process.cwd(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${exitCode}.`);
  }
}

async function tagExists(tag: string): Promise<boolean> {
  const child = Bun.spawn(["git", "show-ref", "--verify", "--quiet", tag], {
    cwd: process.cwd(),
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await child.exited) === 0;
}

async function remoteTagExists(tag: string): Promise<boolean> {
  return Boolean(
    await gitOutput(["ls-remote", "--tags", "origin", `refs/tags/${tag}`]),
  );
}

async function ensureReleasePreconditions(tag: string): Promise<void> {
  await gitOutput(["rev-parse", "--show-toplevel"]);
  await gitOutput(["remote", "get-url", "origin"]);

  if (await gitOutput(["status", "--porcelain"])) {
    throw new Error(
      "The Git working tree must be clean before creating a release.",
    );
  }

  if (await tagExists(`refs/tags/${tag}`)) {
    throw new Error(`The local tag ${tag} already exists.`);
  }

  if (await remoteTagExists(tag)) {
    throw new Error(`The remote tag ${tag} already exists on origin.`);
  }
}

async function main(): Promise<void> {
  const packagePath = join(process.cwd(), "package.json");
  const manifest = JSON.parse(
    await readFile(packagePath, "utf8"),
  ) as PackageManifest;

  if (typeof manifest.version !== "string") {
    throw new Error("package.json must contain a string version.");
  }

  const currentVersion = manifest.version;
  p.intro("docker-dev release");
  p.note(`Current version: ${currentVersion}`, "Version");

  const answer = await p.text({
    message: "New version",
    initialValue: currentVersion,
    placeholder: "0.3.0",
    validate: (value) => {
      if (!semverPattern.test(value ?? "")) {
        return "Use a Semantic Version without the v prefix, for example 0.3.0.";
      }

      if (value === currentVersion) {
        return "Choose a version different from the current version.";
      }
    },
  });

  if (p.isCancel(answer)) {
    p.cancel("Release cancelled.");
    return;
  }

  const version = answer;
  const tag = `v${version}`;
  await ensureReleasePreconditions(tag);

  const confirmed = await p.confirm({
    message: `Commit package.json, create ${tag}, and push it to origin?`,
    initialValue: false,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Release cancelled.");
    return;
  }

  manifest.version = version;
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);

  await runGit(["add", "package.json"]);
  await runGit(["commit", "-m", `chore: release ${tag}`]);
  await runGit(["tag", "-a", tag, "-m", `Release ${tag}`]);
  await runGit(["push", "origin", "HEAD", `refs/tags/${tag}`]);

  p.outro(
    `${tag} was pushed to origin. GitHub Actions will publish the release.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  p.log.error(message);
  process.exitCode = 1;
});
