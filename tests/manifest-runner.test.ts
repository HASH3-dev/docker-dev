import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCommandManifest } from "../src/schemas/manifest";
import {
  generatePluginOverride,
  resolveInfrastructureCompose,
} from "@lib/compose";
import { createContext } from "@lib/context";
import { runManifest } from "@internal/command-runner";
import { ActionRegistry } from "@internal/registry";
import { materializeAssets } from "@internal/assets";
import {
  planPorts,
  planToolVersions,
  planVersionFile,
} from "../src/commands/setup/plan";

describe("runManifest", () => {
  test("expands $@ without evaluating input", async () => {
    const registry = new ActionRegistry();
    const received: string[][] = [];
    registry.register("record", async (_context, args) => {
      received.push([...args]);
    });
    const manifest = parseCommandManifest({
      $schema: "../src/schemas/command.schema.json",
      name: "example",
      args: "<argument>",
      summary: "Example command.",
      help: "Example command.",
      steps: [{ call: { function: "record", args: ["prefix", "$@"] } }],
    });

    await runManifest(
      manifest,
      registry,
      createContext(["$(unsafe)", "value"]),
    );

    expect(received).toEqual([["prefix", "$(unsafe)", "value"]]);
  });
});

describe("resolveInfrastructureCompose", () => {
  test("uses the conventional Compose file when merge is enabled", async () => {
    const project = "/tmp/docker-dev-compose-single";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "compose.yml"), "services: {}\n");

    expect(resolveInfrastructureCompose(project, { mergeCompose: true })).toBe(
      join(project, "compose.yml"),
    );

    await rm(project, { recursive: true, force: true });
  });

  test("uses an explicit Compose file and rejects ambiguous discovery", async () => {
    const project = "/tmp/docker-dev-compose-multiple";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "compose.yml"), "services: {}\n");
    await writeFile(join(project, "compose.yaml"), "services: {}\n");
    await writeFile(join(project, "compose.dev.yml"), "services: {}\n");

    expect(() =>
      resolveInfrastructureCompose(project, { mergeCompose: true }),
    ).toThrow("More than one Compose file was found");
    expect(
      resolveInfrastructureCompose(project, {
        mergeCompose: true,
        mergeFile: "compose.dev.yml",
      }),
    ).toBe(join(project, "compose.dev.yml"));

    await rm(project, { recursive: true, force: true });
  });
});

describe("generatePluginOverride", () => {
  test("adds only the selected plugin's container resources", async () => {
    const root = "/tmp/docker-dev-plugin-override";
    const plugins = join(root, ".docker-dev", "plugins");
    const trivy = join(plugins, "trivy");
    const npm = join(trivy, "plugins", "npm");
    await rm(root, { recursive: true, force: true });
    await mkdir(npm, { recursive: true });
    await writeFile(join(plugins, "plugins.enabled"), "trivy\n");
    await writeFile(join(trivy, "plugins", "plugins.enabled"), "npm\n");
    await writeFile(
      join(trivy, "plugin.json"),
      JSON.stringify({
        name: "trivy",
        kind: "security",
        summary: "Trivy",
      }),
    );
    await writeFile(
      join(npm, "plugin.json"),
      JSON.stringify({
        name: "npm",
        kind: "adapter",
        summary: "npm",
        container: {
          environment: { NPM_CONFIG_CACHE: "/npm-cache" },
          volumes: [
            { name: "node_modules", target: "/workspace/node_modules" },
            { name: "npm_cache", target: "/npm-cache" },
          ],
        },
      }),
    );

    const target = await generatePluginOverride({
      projectRoot: root,
      dockerDevDirectory: join(root, ".docker-dev"),
      interactive: false,
      commandArguments: [],
      commandOptions: {},
    });
    const compose = await readFile(target, "utf8");

    expect(compose).toContain('NPM_CONFIG_CACHE: "/npm-cache"');
    expect(compose).toContain(
      'DOCKER_DEV_WRITABLE_DIRECTORIES: "/workspace/node_modules:/npm-cache"',
    );
    expect(compose).toContain("- node_modules:/workspace/node_modules");
    expect(compose).toContain("- npm_cache:/npm-cache");
    expect(compose).toContain("node_modules:");
    expect(compose).toContain("npm_cache:");

    await rm(root, { recursive: true, force: true });
  });
});

describe("materializeAssets", () => {
  test("preserves project configuration during an asset refresh", async () => {
    const directory = "/tmp/docker-dev-plugin-selection";
    await rm(directory, { recursive: true, force: true });
    await materializeAssets(directory);

    const selection = join(directory, "plugins", "plugins.enabled");
    await writeFile(selection, "# Project selection\ntrivy\n");
    const customCompose = join(directory, "custom-compose.yml");
    await writeFile(customCompose, "services:\n  dev:\n    hostname: custom\n");
    await materializeAssets(directory);

    expect(await readFile(selection, "utf8")).toBe(
      "# Project selection\ntrivy\n",
    );
    expect(await readFile(customCompose, "utf8")).toBe(
      "services:\n  dev:\n    hostname: custom\n",
    );
    const state = JSON.parse(
      await readFile(join(directory, ".docker-dev-state.json"), "utf8"),
    ) as { hashes: Record<string, string> };
    expect(state.hashes["custom-compose.yml"]).toBeUndefined();

    await rm(directory, { recursive: true, force: true });
  });

  test("applies a plan atomically: ports, plugin selection and pruning", async () => {
    const directory = "/tmp/docker-dev-plan-materialize";
    await rm(directory, { recursive: true, force: true });

    await materializeAssets(directory, {
      ports: "DOCKER_DEV_PORTS=4000\n",
      pluginSelections: new Map([
        ["plugins/plugins.enabled", ["trivy"]],
        ["plugins/trivy/plugins/plugins.enabled", ["npm"]],
      ]),
    });

    expect(await readFile(join(directory, "ports.env"), "utf8")).toBe(
      "DOCKER_DEV_PORTS=4000\n",
    );
    expect(
      await readFile(join(directory, "plugins", "plugins.enabled"), "utf8"),
    ).toContain("trivy");
    expect(
      existsSync(join(directory, "plugins", "trivy", "plugins", "npm")),
    ).toBe(true);
    expect(
      existsSync(join(directory, "plugins", "trivy", "plugins", "pnpm")),
    ).toBe(false);
    expect(
      existsSync(join(directory, "plugins", "trivy", "plugins", "yarn")),
    ).toBe(false);
    expect(
      existsSync(
        join(directory, "plugins", "trivy", "plugins", "npm", "commands"),
      ),
    ).toBe(false);

    await rm(directory, { recursive: true, force: true });
  });
});

describe("setup plan (idempotency)", () => {
  test("planPorts reuses an existing valid ports.env without prompting", async () => {
    const directory = "/tmp/docker-dev-plan-ports";
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "ports.env"), "DOCKER_DEV_PORTS=5000\n");

    expect(await planPorts(directory)).toBe("DOCKER_DEV_PORTS=5000\n");

    await rm(directory, { recursive: true, force: true });
  });

  test("planToolVersions reuses an existing .tool-versions without prompting", async () => {
    const project = "/tmp/docker-dev-plan-tool-versions";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, ".tool-versions"), "nodejs 22.0.0\n");

    const plan = await planToolVersions(project);

    expect(plan.runtimes).toEqual(["nodejs"]);
    expect(plan.write).toBeNull();

    await rm(project, { recursive: true, force: true });
  });

  test("planVersionFile skips an existing .docker-dev-version", async () => {
    const project = "/tmp/docker-dev-plan-version-file";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, ".docker-dev-version"), "0.1.0\n");

    expect(planVersionFile(project)).toBeNull();

    await rm(project, { recursive: true, force: true });
  });

  test("planVersionFile proposes writing when missing", async () => {
    const project = "/tmp/docker-dev-plan-version-file-missing";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });

    const write = planVersionFile(project);

    expect(write?.path).toBe(join(project, ".docker-dev-version"));
    expect(write?.content).toMatch(/^\d+\.\d+\.\d+\n$/);

    await rm(project, { recursive: true, force: true });
  });
});
