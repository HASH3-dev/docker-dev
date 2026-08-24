import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ActionRegistry } from "@internal/registry";
import { parseCommandManifest } from "../../../../schemas/manifest";
import { identifyFindings, readReports } from "../reports";
import { renderDashboard, type Ignore } from "./render";

export { parseReport } from "../reports";
export { renderDashboard } from "./render";

const json = (value: unknown, status = 200): Response =>
  Response.json(value, { status });
const redirectHome = (): Response =>
  new Response(null, { status: 303, headers: { location: "/" } });

async function readIgnores(path: string): Promise<Ignore[]> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(value)
      ? value.filter((item): item is Ignore =>
          Boolean(
            item &&
            typeof item === "object" &&
            typeof (item as Ignore).id === "string" &&
            typeof (item as Ignore).comment === "string" &&
            typeof (item as Ignore).createdAt === "string",
          ),
        )
      : [];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeIgnores(path: string, ignores: Ignore[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ignores, null, 2)}\n`);
}

function validIgnore(id: string, comment: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(id) && Boolean(comment) && comment.length <= 1000
  );
}

async function findingExists(
  reportsDirectory: string,
  id: string,
): Promise<boolean> {
  return identifyFindings(await readReports(reportsDirectory)).some((report) =>
    report.findings.some((finding) => finding.id === id),
  );
}

export const scannerActions: Record<string, { plugin: string; action: string; command: string }> = {
  bearer: { plugin: "bearer", action: "scanBearerPath", command: "scan" },
  semgrep: { plugin: "semgrep", action: "scanSemgrepPath", command: "scan" },
  gitleaks: { plugin: "gitleaks", action: "scanGitleaksPath", command: "scan" },
  trivy: { plugin: "trivy", action: "scanTrivyPath", command: "scan" },
  "trivy-iac": { plugin: "trivy", action: "scanTrivyIacPath", command: "scan-iac" },
  "trivy-images": { plugin: "trivy", action: "scanTrivyImages", command: "scan-images" },
};

export function register(registry: ActionRegistry): void {
  registry.register("serveReportsDashboard", async (context, args) => {
    if (args.length) throw new Error("reports:dashboard accepts no arguments.");
    const requestedPort = context.commandOptions.port;
    const port = requestedPort === undefined ? 0 : Number(requestedPort);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("--port must be an integer from 0 to 65535.");

    const reportsDirectory = join(context.dockerDevDirectory, "reports");
    const ignoresPath = join(reportsDirectory, "ignores.json");
    const projectRoot =
      process.env.DOCKER_DEV_HOST_PROJECT_ROOT ?? context.projectRoot;
    const server = Bun.serve({
      hostname: "0.0.0.0",
      port,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/") {
          const reports = identifyFindings(await readReports(reportsDirectory));
          return new Response(
            renderDashboard(
              reports,
              await readIgnores(ignoresPath),
              process.env.DOCKER_DEV_HOST_PROJECT_ROOT ?? projectRoot,
            ),
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        }
        if (request.method === "GET" && url.pathname === "/api/reports") {
          return json({
            reports: identifyFindings(await readReports(reportsDirectory)),
            ignores: await readIgnores(ignoresPath),
          });
        }
        if (request.method === "POST" && url.pathname === "/api/ignores") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return json({ error: "JSON inválido." }, 400);
          }
          const id =
            typeof (body as any)?.id === "string" ? (body as any).id : "";
          const comment =
            typeof (body as any)?.comment === "string"
              ? (body as any).comment.trim()
              : "";
          if (!validIgnore(id, comment))
            return json({ error: "ID ou comentário inválido." }, 400);
          if (!(await findingExists(reportsDirectory, id)))
            return json({ error: "Achado não encontrado." }, 404);
          const ignores = await readIgnores(ignoresPath);
          if (!ignores.some((ignore) => ignore.id === id))
            await writeIgnores(ignoresPath, [
              ...ignores,
              { id, comment, createdAt: new Date().toISOString() },
            ]);
          return json({ ok: true });
        }
        if (
          request.method === "DELETE" &&
          url.pathname.startsWith("/api/ignores/")
        ) {
          const id = url.pathname.slice("/api/ignores/".length);
          if (!/^[a-f0-9]{64}$/.test(id))
            return json({ error: "ID inválido." }, 400);
          await writeIgnores(
            ignoresPath,
            (await readIgnores(ignoresPath)).filter(
              (ignore) => ignore.id !== id,
            ),
          );
          return json({ ok: true });
        }
        if (request.method === "POST" && url.pathname === "/ignores") {
          const form = await request.formData();
          const idValue = form.get("id");
          const commentValue = form.get("comment");
          const id = typeof idValue === "string" ? idValue : "";
          const comment =
            typeof commentValue === "string" ? commentValue.trim() : "";
          if (
            !validIgnore(id, comment) ||
            !(await findingExists(reportsDirectory, id))
          )
            return new Response("Comentário ou achado inválido.", {
              status: 400,
            });
          const ignores = await readIgnores(ignoresPath);
          if (!ignores.some((ignore) => ignore.id === id))
            await writeIgnores(ignoresPath, [
              ...ignores,
              { id, comment, createdAt: new Date().toISOString() },
            ]);
          return redirectHome();
        }
        const removeIgnore = /^\/ignores\/([a-f0-9]{64})\/delete$/.exec(
          url.pathname,
        );
        if (request.method === "POST" && removeIgnore) {
          await writeIgnores(
            ignoresPath,
            (await readIgnores(ignoresPath)).filter(
              (ignore) => ignore.id !== removeIgnore[1],
            ),
          );
          return redirectHome();
        }
        const rerunMatch = /^\/api\/rerun\/([a-z][a-z-]*)$/.exec(url.pathname);
        if (request.method === "POST" && rerunMatch) {
          const scanner = rerunMatch[1];
          if (!scanner) return json({ error: "Scanner inválido." }, 400);
          const scannerAction = scannerActions[scanner];
          if (!scannerAction) return json({ error: "Scanner inválido." }, 400);

          try {
            const manifestPath = join(
              context.dockerDevDirectory,
              "plugins",
              scannerAction.plugin,
              "commands",
              scannerAction.command,
              "command.json",
            );
            const manifestContent = await readFile(manifestPath, "utf8");
            const manifest = parseCommandManifest(JSON.parse(manifestContent));

            const handler = registry.get(scannerAction.action);
            await handler(context, [], manifest);
            return json({ ok: true });
          } catch (error) {
            // Exit codes 1-2 geralmente significam "findings encontrados", não erro real
            const isFindingsError =
              error instanceof Error &&
              /exited with code [12]$/.test(error.message);

            if (isFindingsError) {
              console.log(`Scan %s concluído com findings`, scanner);
              return json({ ok: true });
            }

            console.error(`Scan %s falhou:`, scanner, error);
            return json({ error: "Scan falhou." }, 500);
          }
        }
        return new Response("Not found", { status: 404 });
      },
    });
    console.log(`Security reports: http://127.0.0.1:${server.port}`);
    await new Promise<void>(() => {});
  });
}
