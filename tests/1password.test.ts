import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrapper = join(
  import.meta.dir,
  "../src/plugins/1password/bin/docker-dev-secrets",
);
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function setup(options: {
  accounts: string;
  whoami?: boolean;
  add?: boolean;
  signin?: boolean;
}) {
  const directory = await mkdtemp(join(tmpdir(), "docker-dev-1password-"));
  directories.push(directory);
  const bin = join(directory, "bin");
  const log = join(directory, "op.log");
  const envFile = join(directory, ".env");
  await Bun.write(envFile, "SECRET=op://vault/item/field\n");
  await Bun.write(
    join(bin, "op"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  account) [[ "$2" = list ]] && printf '%s\\n' "$FAKE_ACCOUNTS" || [[ "$2" = add && "$FAKE_ADD" = 1 ]] ;;
  whoami) [[ "$FAKE_WHOAMI" = 1 ]] ;;
  signin) [[ "$FAKE_SIGNIN" = 1 ]] || { exit 1; }; printf 'export OP_SESSION=1\\n' ;;
  run) exit 0 ;;
  *) exit 2 ;;
esac
`,
  );
  await chmod(join(bin, "op"), 0o755);

  return {
    command: [wrapper, envFile, "echo", "ok"],
    environment: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_LOG: log,
      FAKE_ACCOUNTS: options.accounts,
      FAKE_WHOAMI: options.whoami ? "1" : "0",
      FAKE_ADD: options.add ? "1" : "0",
      FAKE_SIGNIN: options.signin ? "1" : "0",
    },
    log,
  };
}

async function run(
  command: string[],
  environment: Record<string, string | undefined>,
) {
  const process = Bun.spawn({
    cmd: command,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function logCalls(path: string): Promise<string[]> {
  return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
}

describe("docker-dev-secrets", () => {
  test("rejects a missing env file", async () => {
    const fixture = await setup({ accounts: "[]" });
    const result = await run([wrapper], fixture.environment);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("env file not found");
  });

  test("uses an existing session without a terminal", async () => {
    const fixture = await setup({ accounts: '[{"url":"example"}]', whoami: true });

    expect((await run(fixture.command, fixture.environment)).exitCode).toBe(0);
    expect(await logCalls(fixture.log)).toEqual([
      "account list --format json",
      "whoami",
      `run --env-file=${fixture.command[1]} --no-masking -- echo ok`,
    ]);
  });

  test("rejects missing accounts without a terminal", async () => {
    const fixture = await setup({ accounts: "[]" });

    const result = await run(fixture.command, fixture.environment);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("requires an interactive terminal");
    expect(await logCalls(fixture.log)).toEqual(["account list --format json"]);
  });

  test("rejects an expired session without a terminal", async () => {
    const fixture = await setup({ accounts: '[{"url":"example"}]' });

    const result = await run(fixture.command, fixture.environment);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("requires an interactive terminal");
    expect(await logCalls(fixture.log)).toEqual([
      "account list --format json",
      "whoami",
    ]);
  });

  test("adds an account and signs in from a terminal", async () => {
    const fixture = await setup({ accounts: "[]", add: true, signin: true });

    expect(
      (
        await run(
          ["script", "-qefc", fixture.command.join(" "), "/dev/null"],
          fixture.environment,
        )
      ).exitCode,
    ).toBe(0);
    expect(await logCalls(fixture.log)).toEqual([
      "account list --format json",
      "account add",
      "signin -f",
      `run --env-file=${fixture.command[1]} --no-masking -- echo ok`,
    ]);
  });

  test("does not sign in or run command when adding an account fails", async () => {
    const fixture = await setup({ accounts: "[]" });

    await run(
      ["script", "-qefc", fixture.command.join(" "), "/dev/null"],
      fixture.environment,
    );

    expect(await logCalls(fixture.log)).toEqual([
      "account list --format json",
      "account add",
    ]);
  });

  test("does not run command when sign-in fails", async () => {
    const fixture = await setup({ accounts: '[{"url":"example"}]' });

    const result = await run(
      ["script", "-qefc", fixture.command.join(" "), "/dev/null"],
      fixture.environment,
    );

    expect(result.stdout).not.toContain("ok");
    expect(await logCalls(fixture.log)).toEqual([
      "account list --format json",
      "whoami",
      "signin -f",
    ]);
  });
});
