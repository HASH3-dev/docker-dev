import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseCommandManifest,
  parsePluginManifest,
} from "../src/schemas/manifest";
import {
  generatePluginOverride,
  portsOverride,
  resolveInfrastructureCompose,
} from "@lib/compose";
import { createContext } from "@lib/context";
import { parsePortList } from "@lib/ports";
import { runManifest } from "@internal/command-runner";
import { ActionRegistry } from "@internal/registry";
import { registerInternalActions } from "@internal/actions";
import { materializeAssets } from "@internal/assets";
import { collectSelectedPluginOutputPaths } from "@internal/plugins";
import {
  planPorts,
  planToolVersions,
  planVersionFile,
} from "../src/commands/setup/plan";
import { shouldStartFreshShell } from "../src/commands/setup/command";
import packageManifest from "../package.json";
import { ensureProjectExecutable } from "@lib/host";

describe("plugin report ignores", () => {
  test("writes normalized report paths to the managed gitignore block", async () => {
    const directory = "/tmp/docker-dev-plugin-report-ignores";
    await rm(directory, { recursive: true, force: true });

    await ensureProjectExecutable(directory, [
      "reports/semgrep.json",
      "reports/bearer.json",
      "reports/gitleaks.json",
    ]);

    expect(await readFile(join(directory, ".gitignore"), "utf8")).toBe(
      "# >>> docker-dev managed local files >>>\ndocker-dev\n.docker-dev-state.json\nreports/semgrep.json\nreports/bearer.json\nreports/gitleaks.json\n# <<< docker-dev managed local files <<<\n",
    );
    await rm(directory, { recursive: true, force: true });
  });
});

describe("setup fresh shell", () => {
  test("starts one fresh shell but does not nest one created by setup", () => {
    expect(shouldStartFreshShell({})).toBe(true);
    expect(shouldStartFreshShell({ DOCKER_DEV_FRESH_SHELL: "1" })).toBe(false);
  });
});

describe("command manifests", () => {
  test("accepts qualified plugin command names and output", () => {
    expect(() =>
      parseCommandManifest({
        name: "trivy:scan",
        summary: "Scan dependencies.",
        help: "Scan dependencies.",
        output: { file: "reports/trivy.json" },
        steps: [{ call: { function: "record" } }],
      }),
    ).not.toThrow();
  });

  test("rejects command output path traversal", () => {
    expect(() =>
      parseCommandManifest({
        name: "example",
        summary: "Example command.",
        help: "Example command.",
        output: { file: "../report.json" },
        steps: [{ call: { function: "record" } }],
      }),
    ).toThrow("Invalid command manifest.");
  });

  test("accepts plugin output", () => {
    expect(() =>
      parsePluginManifest({
        name: "example",
        kind: "example",
        summary: "Example plugin.",
        output: { file: "reports/example.json" },
      }),
    ).not.toThrow();
  });

  test("Trivy host wrappers dispatch qualified adapter commands", async () => {
    for (const manager of ["bun", "npm", "pnpm", "yarn", "uv"]) {
      const wrapper = await readFile(
        join(
          import.meta.dir,
          "..",
          "src",
          "plugins",
          "trivy",
          "plugins",
          manager,
          "host-bin",
          manager,
        ),
        "utf8",
      );
      expect(wrapper).toContain(`docker-dev\" trivy:${manager} `);
    }
  });
});

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

describe("ports", () => {
  test("accepts an empty port list", () => {
    expect(parsePortList("")).toEqual([]);
    expect(parsePortList("  ")).toEqual([]);
  });

  test("writes no ports when ports.env is empty", async () => {
    const directory = "/tmp/docker-dev-empty-ports";
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "ports.env"), "DOCKER_DEV_PORTS=\n");

    const target = await portsOverride({
      projectRoot: directory,
      dockerDevDirectory: directory,
      interactive: false,
      commandArguments: [],
      commandOptions: {},
    });

    expect(await readFile(target, "utf8")).toBe("services:\n  dev: {}\n");
    await rm(directory, { recursive: true, force: true });
  });
});

describe("materializeAssets", () => {
  test("writes the Docker report exclusions", async () => {
    const directory = "/tmp/docker-dev-dockerignore";
    await rm(directory, { recursive: true, force: true });

    await materializeAssets(directory);

    expect(await readFile(join(directory, ".dockerignore"), "utf8")).toBe(
      "reports/semgrep.json\nreports/bearer.json\nreports/gitleaks.json\n",
    );
    await rm(directory, { recursive: true, force: true });
  });

  test("collects normalized selected report paths", async () => {
    const directory = "/tmp/docker-dev-plugin-output-paths";
    await rm(directory, { recursive: true, force: true });
    await materializeAssets(directory);
    await writeFile(
      join(directory, "plugins", "plugins.enabled"),
      "trivy\nsemgrep\nbearer\ngitleaks\nreports\n",
    );

    expect(await collectSelectedPluginOutputPaths(directory)).toEqual([
      "reports/bearer.json",
      "reports/gitleaks.json",
      "reports/semgrep.json",
      "reports/trivy.json",
    ]);
    await rm(directory, { recursive: true, force: true });
  });

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

  test("preserves report ignore decisions during an asset refresh", async () => {
    const directory = "/tmp/docker-dev-report-ignores";
    const ignores = join(directory, "reports", "ignores.json");
    await rm(directory, { recursive: true, force: true });
    await materializeAssets(directory);
    await mkdir(join(directory, "reports"), { recursive: true });
    await writeFile(ignores, '[{"id":"finding","comment":"Reviewed","createdAt":"2026-08-19T00:00:00.000Z"}]\n');

    await materializeAssets(directory);

    expect(await readFile(ignores, "utf8")).toBe(
      '[{"id":"finding","comment":"Reviewed","createdAt":"2026-08-19T00:00:00.000Z"}]\n',
    );
    await rm(directory, { recursive: true, force: true });
  });

  test("preserves plugin configuration during an asset refresh", async () => {
    const directory = "/tmp/docker-dev-plugin-config";
    const config = join(
      directory,
      "plugins",
      "trivy",
      "plugins",
      "bun",
      "bun.config.json",
    );
    await rm(directory, { recursive: true, force: true });
    await materializeAssets(directory);

    expect(await readFile(config, "utf8")).toContain('"ignoreScripts": true');
    await writeFile(config, '{"ignoreScripts":true}\n');
    await materializeAssets(directory);

    expect(await readFile(config, "utf8")).toBe('{"ignoreScripts":true}\n');
    await rm(directory, { recursive: true, force: true });
  });

  test("adopts a tracked tree missing local installation state", async () => {
    const directory = "/tmp/docker-dev-adopt-state-less";
    await rm(directory, { recursive: true, force: true });
    await materializeAssets(directory);
    await writeFile(
      join(directory, ".gitignore"),
      "# >>> docker-dev managed local files >>>\ndocker-dev\n.docker-dev-state.json\n# <<< docker-dev managed local files <<<\n",
    );
    await rm(join(directory, ".docker-dev-state.json"));

    await materializeAssets(directory);

    expect(existsSync(join(directory, ".docker-dev-state.json"))).toBe(true);
    await rm(directory, { recursive: true, force: true });
  });

  test("refuses a non-empty directory without docker-dev local state marker", async () => {
    const directory = "/tmp/docker-dev-unmanaged";
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "Dockerfile"), "FROM scratch\n");

    await expect(materializeAssets(directory)).rejects.toThrow(
      ".docker-dev is not managed by docker-dev v2; refusing to replace it.",
    );

    await rm(directory, { recursive: true, force: true });
  });

  test("applies a plan atomically: ports, plugin selection and pruning", async () => {
    const directory = "/tmp/docker-dev-plan-materialize";
    await rm(directory, { recursive: true, force: true });

    await materializeAssets(directory, {
      ports: "DOCKER_DEV_PORTS=4000\n",
      pluginSelections: new Map([
        ["plugins/plugins.enabled", ["trivy"]],
        ["plugins/trivy/plugins/plugins.enabled", ["bun"]],
      ]),
    });

    expect(await readFile(join(directory, "ports.env"), "utf8")).toBe(
      "DOCKER_DEV_PORTS=4000\n",
    );
    expect(
      await readFile(join(directory, "plugins", "plugins.enabled"), "utf8"),
    ).toContain("trivy");
    expect(
      existsSync(join(directory, "plugins", "trivy", "plugins", "bun")),
    ).toBe(true);
    expect(
      existsSync(join(directory, "plugins", "trivy", "plugins", "bun", "bun.config.json")),
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

  test("materializeAssets creates only command.json, not source files", async () => {
    const directory = "/tmp/docker-dev-command-manifest-only";
    await rm(directory, { recursive: true, force: true });

    await materializeAssets(directory, {
      ports: "DOCKER_DEV_PORTS=5000\n",
      pluginSelections: new Map([
        ["plugins/plugins.enabled", ["semgrep"]],
      ]),
    });

    const commandJson = join(directory, "plugins", "semgrep", "commands", "scan", "command.json");
    const commandTs = join(directory, "plugins", "semgrep", "commands", "scan", "command.ts");

    expect(existsSync(commandJson)).toBe(true);
    expect(existsSync(commandTs)).toBe(false);

    const { prunePlugins } = await import("../src/internal/plugins");
    await prunePlugins(directory);

    // prunePlugins doesn't touch selected plugins - command.json remains
    expect(existsSync(commandJson)).toBe(true);

    await rm(directory, { recursive: true, force: true });
  });
});

describe("refreshAssets action", () => {
  test("rebuild reconciles CLI version changes without deleting user state", async () => {
    const directory = "/tmp/docker-dev-rebuild-reconcile";
    await rm(directory, { recursive: true, force: true });

    // First materialize with plugin selection
    await materializeAssets(directory, {
      ports: "DOCKER_DEV_PORTS=6000\n",
      pluginSelections: new Map([
        ["plugins/plugins.enabled", ["semgrep", "bearer"]],
      ]),
    });

    // Add user state
    await mkdir(join(directory, "reports"), { recursive: true });
    await writeFile(
      join(directory, "reports", "ignores.json"),
      '[{"id":"old","comment":"Reviewed","createdAt":"2026-08-19T00:00:00.000Z"}]\n',
    );

    // Modify ports.env (user configuration)
    await writeFile(join(directory, "ports.env"), "DOCKER_DEV_PORTS=7000\n");

    // Rebuild (no plan = preserve existing config, reconcile with current CLI version)
    await materializeAssets(directory);
    const { prunePlugins } = await import("../src/internal/plugins");
    await prunePlugins(directory);

    // New assets from current CLI should exist
    const semgrepJson = join(directory, "plugins", "semgrep", "commands", "scan", "command.json");
    const bearerJson = join(directory, "plugins", "bearer", "commands", "scan", "command.json");
    expect(existsSync(semgrepJson)).toBe(true);
    expect(existsSync(bearerJson)).toBe(true);

    // User state preserved
    expect(await readFile(join(directory, "reports", "ignores.json"), "utf8")).toBe(
      '[{"id":"old","comment":"Reviewed","createdAt":"2026-08-19T00:00:00.000Z"}]\n',
    );

    // User configuration preserved
    expect(await readFile(join(directory, "ports.env"), "utf8")).toBe("DOCKER_DEV_PORTS=7000\n");

    // Unselected plugin should not exist
    expect(existsSync(join(directory, "plugins", "trivy"))).toBe(false);
    expect(existsSync(join(directory, "plugins", "gitleaks"))).toBe(false);

    await rm(directory, { recursive: true, force: true });
  });

  test("refuses a stale .docker-dev-version", async () => {
    const project = "/tmp/docker-dev-refresh-assets-version";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, ".docker-dev-version"), "0.0.1\n");

    const registry = new ActionRegistry();
    registerInternalActions(registry);

    const context = {
      ...createContext([]),
      projectRoot: project,
      dockerDevDirectory: join(project, ".docker-dev"),
    };
    await expect(registry.get("refreshAssets")(context, [])).rejects.toThrow(
      "Run: docker-dev update",
    );
    expect(await readFile(join(project, ".docker-dev-version"), "utf8")).toBe(
      "0.0.1\n",
    );
    expect(existsSync(context.dockerDevDirectory)).toBe(false);

    await rm(project, { recursive: true, force: true });
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

  test("planPorts reuses an empty port configuration", async () => {
    const directory = "/tmp/docker-dev-plan-empty-ports";
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "ports.env"), "DOCKER_DEV_PORTS=\n");

    expect(await planPorts(directory)).toBe("DOCKER_DEV_PORTS=\n");

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

  test("planVersionFile skips an existing .docker-dev-version already matching the binary version", async () => {
    const project = "/tmp/docker-dev-plan-version-file";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(
      join(project, ".docker-dev-version"),
      `${packageManifest.version}\n`,
    );

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

  test("planVersionFile preserves an existing .docker-dev-version", async () => {
    const project = "/tmp/docker-dev-plan-version-file-stale";
    await rm(project, { recursive: true, force: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(project, ".docker-dev-version"), "0.0.1\n");

    expect(planVersionFile(project)).toBeNull();

    await rm(project, { recursive: true, force: true });
  });

});
