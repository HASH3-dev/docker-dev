import packageManifest from "../../../package.json";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parsePortList } from "@lib/ports";

export interface Write {
  path: string;
  content: string;
}

function portsContent(ports: string): string {
  return [
    "# Comma-separated host:container mappings published only on localhost.",
    "# A plain port maps to itself. Example: DOCKER_DEV_PORTS=3000,3002:3001,5173",
    `DOCKER_DEV_PORTS=${ports}`,
    "",
  ].join("\n");
}

/** Decides the final contents of .docker-dev/ports.env, prompting only when unset. */
export async function planPorts(dockerDevDirectory: string): Promise<string> {
  const portsFile = join(dockerDevDirectory, "ports.env");

  if (existsSync(portsFile)) {
    const existing = await Bun.file(portsFile).text();
    const configured = existing
      .split("\n")
      .find((line) => line.startsWith("DOCKER_DEV_PORTS="))
      ?.slice("DOCKER_DEV_PORTS=".length);

    if (configured) {
      try {
        parsePortList(configured);
        return existing;
      } catch {
        /* Fall through and reconfigure an invalid value. */
      }
    }
  }

  p.note(
    "Development ports are published only to localhost. Use commas for multiple ports and host:container to avoid conflicts.\nExample: 3000,3002:3001,5173",
    "Published ports",
  );

  const answer = await p.text({
    message: "Ports to expose",
    initialValue: "3000",
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

  return portsContent(parsePortList(answer).join(","));
}

function configuredRuntimes(contents: string): string[] {
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/, 1)[0])
    .filter((runtime): runtime is string => Boolean(runtime));
}

export interface ToolVersionsPlan {
  runtimes: string[];
  write: Write | null;
}

/** Decides .tool-versions contents, prompting only when the project has none. */
export async function planToolVersions(
  projectRoot: string,
): Promise<ToolVersionsPlan> {
  const toolVersions = join(projectRoot, ".tool-versions");

  if (existsSync(toolVersions)) {
    const contents = await Bun.file(toolVersions).text();
    return { runtimes: configuredRuntimes(contents), write: null };
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

  const content = `${entries.join("\n")}\n`;
  return {
    runtimes: configuredRuntimes(content),
    write: { path: toolVersions, content },
  };
}

/** Decides whether .docker-dev-version needs to be created. */
export function planVersionFile(projectRoot: string): Write | null {
  const versionFile = join(projectRoot, ".docker-dev-version");

  if (existsSync(versionFile)) {
    return null;
  }

  return { path: versionFile, content: `${packageManifest.version}\n` };
}
