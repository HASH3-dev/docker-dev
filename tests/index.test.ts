import { describe, expect, test } from "bun:test";

async function run(...args: string[]) {
  const child = Bun.spawn({
    cmd: [process.execPath, "src/index.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("command options", () => {
  test("rejects unknown options for fixed commands", async () => {
    const result = await run("setup", "--forc");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("unknown option '--forc'");
  });

  test("allows unknown options for variadic commands", async () => {
    const result = await run("1password:secrets", "echo", "--typo");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Provide --env-file <path>.");
    expect(result.stderr).not.toContain("unknown option '--typo'");
  });

  test("allows unknown options for forwarded commands", async () => {
    const result = await run("bearer:scan", "--force", "--help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: docker-dev bearer:scan");
    expect(result.stderr).not.toContain("unknown option '--force'");
  });
});
