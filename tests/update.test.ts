import { describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import packageManifest from "../package.json";
import { createContext } from "@lib/context";
import {
  latestRelease,
  pinnedVersion,
  releases,
  requireMatchingVersion,
  updateCommand,
} from "@lib/update";
import { ActionRegistry } from "@internal/registry";
import { register } from "../src/commands/update/command";

const project = "/tmp/docker-dev-update";

async function cleanProject(): Promise<void> {
  await rm(project, { recursive: true, force: true });
  await mkdir(project, { recursive: true });
}

describe("update command", () => {
  test("uses a project installer and forwards an explicit version", async () => {
    await cleanProject();
    const scripts = join(project, "scripts");
    await mkdir(scripts);
    await writeFile(
      join(scripts, "install.sh"),
      '#!/usr/bin/env bash\nprintf "%s|%s" "$PWD" "$1" > installed\n',
    );
    await chmod(join(scripts, "install.sh"), 0o755);

    const registry = new ActionRegistry();
    register(registry);
    await registry.get("update")(
      { ...createContext(["0.7.0"]), projectRoot: project },
      [],
    );

    expect(await readFile(join(project, "installed"), "utf8")).toBe(
      `${project}|0.7.0`,
    );
    await rm(project, { recursive: true, force: true });
  });

  test("selects local installer before curl installer", async () => {
    await cleanProject();
    expect(updateCommand(project).display).toStartWith("curl -fsSL");

    await mkdir(join(project, "scripts"));
    await writeFile(join(project, "scripts", "install.sh"), "");
    expect(updateCommand(project, "0.7.0")).toEqual({
      display: "./scripts/install.sh 0.7.0",
      command: ["bash", "scripts/install.sh", "0.7.0"],
    });
    await rm(project, { recursive: true, force: true });
  });

  test("reads an optional version pin", async () => {
    await cleanProject();
    expect(await pinnedVersion(project)).toBeNull();
    await writeFile(join(project, ".docker-dev-version"), "0.7.0\n");
    expect(await pinnedVersion(project)).toBe("0.7.0");
    await rm(project, { recursive: true, force: true });
  });

  test("rejects a pin different from running version", async () => {
    await cleanProject();
    await writeFile(join(project, ".docker-dev-version"), "0.2.0\n");

    await expect(requireMatchingVersion(project)).rejects.toThrow(
      `Running version: ${packageManifest.version}\nPinned version: 0.2.0\nRun: docker-dev update`,
    );
    await rm(project, { recursive: true, force: true });
  });

  test("reads GitHub release metadata", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("/latest")
            ? { tag_name: "v0.7.0" }
            : [{ tag_name: "v0.7.0" }, { tag_name: "v0.6.0" }],
        ),
      )) as typeof fetch;

    try {
      expect(await latestRelease()).toBe("v0.7.0");
      expect(await releases()).toEqual(["v0.7.0", "v0.6.0"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("marks running version in release list", async () => {
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const output: string[] = [];
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ tag_name: "v0.6.0" }, { tag_name: "v0.5.0" }]))
    ) as unknown as typeof fetch;
    console.log = (value: string) => output.push(value);

    try {
      const registry = new ActionRegistry();
      register(registry);
      await registry.get("update")(createContext([], { list: true }), []);
      expect(output).toEqual(["v0.6.0 (running)\nv0.5.0"]);
    } finally {
      globalThis.fetch = originalFetch;
      console.log = originalLog;
    }
  });

  test("rejects conflicting update modes", async () => {
    const registry = new ActionRegistry();
    register(registry);
    const context = createContext(["0.7.0"], { list: true });

    await expect(registry.get("update")(context, [])).rejects.toThrow(
      "--list and --check do not accept a version.",
    );
  });
});
