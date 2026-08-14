import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import packageManifest from "../../package.json";

const installerUrl =
  "https://raw.githubusercontent.com/HASH3-dev/docker-dev/main/scripts/install.sh";
const releasesUrl = "https://api.github.com/repos/HASH3-dev/docker-dev/releases";

export interface UpdateCommand {
  display: string;
  command: string[];
}

export async function pinnedVersion(projectRoot: string): Promise<string | null> {
  try {
    const version = (await readFile(join(projectRoot, ".docker-dev-version"), "utf8")).trim();
    return version || null;
  } catch {
    return null;
  }
}

export function updateCommand(
  projectRoot: string,
  version?: string,
): UpdateCommand {
  if (existsSync(join(projectRoot, "scripts", "install.sh"))) {
    return {
      display: `./scripts/install.sh${version ? ` ${version}` : ""}`,
      command: ["bash", "scripts/install.sh", ...(version ? [version] : [])],
    };
  }

  return {
    display: `curl -fsSL ${installerUrl} | bash${version ? ` -s -- ${version}` : ""}`,
    command: [
      "bash",
      "-c",
      `curl -fsSL ${installerUrl} | bash${version ? " -s -- \"$1\"" : ""}`,
      "bash",
      ...(version ? [version] : []),
    ],
  };
}

export async function latestRelease(): Promise<string> {
  const response = await fetch(`${releasesUrl}/latest`);
  if (!response.ok) {
    throw new Error(`Could not fetch latest release: ${response.status} ${response.statusText}`);
  }

  const release = (await response.json()) as { tag_name?: unknown };
  if (typeof release.tag_name !== "string") {
    throw new Error("Could not read latest release version.");
  }
  return release.tag_name;
}

export async function releases(): Promise<string[]> {
  const response = await fetch(releasesUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch releases: ${response.status} ${response.statusText}`);
  }

  const values = (await response.json()) as Array<{ tag_name?: unknown }>;
  if (!Array.isArray(values)) {
    throw new Error("Could not read releases.");
  }
  return values.flatMap(({ tag_name }) =>
    typeof tag_name === "string" ? [tag_name] : [],
  );
}

export async function requireMatchingVersion(projectRoot: string): Promise<void> {
  const pinned = await pinnedVersion(projectRoot);
  if (!pinned || pinned === packageManifest.version) return;

  throw new Error(
    [
      `Running version: ${packageManifest.version}`,
      `Pinned version: ${pinned}`,
      `Run: docker-dev update`,
    ].join("\n"),
  );
}
