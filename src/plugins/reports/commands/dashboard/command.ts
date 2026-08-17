import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ActionRegistry } from "@internal/registry";

type Finding = {
  severity: string;
  title: string;
  location?: string;
  details: Array<[string, unknown]>;
};

type Report = {
  file: string;
  title: string;
  findings: Finding[];
  raw?: unknown;
  warning?: string;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function severity(value: unknown): string {
  const normalized = String(value ?? "unknown").toLowerCase();
  return ["critical", "high", "medium", "low"].includes(normalized)
    ? normalized
    : "unknown";
}

function renderValue(key: string, value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (key === "Secret" || key === "Match") {
    return `<div class="secret"><button type="button" aria-label="Mostrar ${escapeHtml(key)}" title="Mostrar/ocultar">◉</button><code hidden>${escapeHtml(text)}</code></div>`;
  }
  return `<code>${escapeHtml(text)}</code>`;
}

function trivy(value: any): Finding[] {
  return (value.Results ?? []).flatMap((result: any) =>
    (result.Vulnerabilities ?? []).map((item: any) => ({
      severity: severity(item.Severity),
      title: `${item.VulnerabilityID ?? "Vulnerability"}: ${item.PkgName ?? "unknown package"}`,
      location: result.Target,
      details: [
        ["Installed", item.InstalledVersion],
        ["Fixed", item.FixedVersion],
        ["Title", item.Title],
        ["Description", item.Description],
      ].filter(([, detail]) => detail != null),
    })),
  );
}

function semgrep(value: any): Finding[] {
  return (value.results ?? []).map((item: any) => ({
    severity: severity(item.extra?.severity),
    title: item.check_id ?? "Semgrep finding",
    location: item.path
      ? `${item.path}:${item.start?.line ?? "?"}`
      : undefined,
    details: [
      ["Message", item.extra?.message],
      ["Metadata", item.extra?.metadata],
    ].filter(([, detail]) => detail != null),
  }));
}

function gitleaks(value: any[]): Finding[] {
  return value.map((item) => ({
    severity: "high",
    title: item.RuleID ?? item.Description ?? "Secret detected",
    location: item.File
      ? `${item.File}:${item.StartLine ?? "?"}`
      : undefined,
    details: Object.entries(item).filter(([key]) => key !== "RuleID" && key !== "File" && key !== "StartLine"),
  }));
}

function bearer(value: any): Finding[] {
  const findings = value.findings ?? value.issues ?? value.results ?? [];
  return Array.isArray(findings)
    ? findings.map((item: any) => ({
        severity: severity(item.severity ?? item.level),
        title: item.title ?? item.rule_id ?? item.id ?? "Bearer finding",
        location: item.filename ?? item.path ?? item.file,
        details: Object.entries(item).filter(([key]) => !["severity", "level", "title", "rule_id", "id", "filename", "path", "file"].includes(key)),
      }))
    : [];
}

function parseReport(file: string, value: unknown): Report {
  if (file === "trivy.json" && value && typeof value === "object") {
    return { file, title: "Trivy", findings: trivy(value) };
  }
  if (file === "semgrep.json" && value && typeof value === "object") {
    return { file, title: "Semgrep", findings: semgrep(value) };
  }
  if (file === "gitleaks.json" && Array.isArray(value)) {
    return { file, title: "Gitleaks", findings: gitleaks(value) };
  }
  if (file === "bearer.json" && value && typeof value === "object") {
    return { file, title: "Bearer", findings: bearer(value) };
  }
  return { file, title: file.replace(/\.json$/, ""), findings: [], raw: value };
}

function renderFinding(finding: Finding): string {
  return `<article class="finding"><header><span class="severity ${finding.severity}">${finding.severity}</span><strong>${escapeHtml(finding.title)}</strong>${finding.location ? `<span class="location">${escapeHtml(finding.location)}</span>` : ""}</header>${finding.details.length ? `<dl>${finding.details.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${renderValue(key, value)}</dd>`).join("")}</dl>` : ""}</article>`;
}

export function renderDashboard(reports: Report[]): string {
  const findings = reports.flatMap((report) => report.findings);
  const counts = ["critical", "high", "medium", "low", "unknown"].map(
    (level) => [level, findings.filter((finding) => finding.severity === level).length] as const,
  );
  const content = reports.length
    ? `<div class="tabs" role="tablist" aria-label="Relatórios">${reports.map((report, index) => `<button class="tab${index ? "" : " active"}" type="button" role="tab" id="tab-${index}" aria-controls="report-${index}" aria-selected="${index === 0}" data-tab="${index}">${escapeHtml(report.title)}<span class="count">${report.findings.length}</span></button>`).join("")}</div><div class="panels">${reports.map((report, index) => `<section class="report" role="tabpanel" id="report-${index}" aria-labelledby="tab-${index}"${index ? " hidden" : ""}><header><div><h2>${escapeHtml(report.title)}</h2><p>${escapeHtml(report.file)}</p></div><b>${report.findings.length} achado${report.findings.length === 1 ? "" : "s"}</b></header>${report.warning ? `<p class="warning">${escapeHtml(report.warning)}</p>` : ""}${report.raw !== undefined ? `<details><summary>JSON bruto</summary><pre>${escapeHtml(JSON.stringify(report.raw, null, 2))}</pre></details>` : report.findings.length ? `<div class="findings">${report.findings.map(renderFinding).join("")}</div>` : "<p class=empty>Nenhum achado.</p>"}</section>`).join("")}</div>`
    : "<section class=empty><h2>Nenhum relatório encontrado</h2><p>Execute uma ferramenta de análise e gere dashboard novamente.</p></section>";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Security Reports</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#101316;color:#e8edf2}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#1d2936,#101316 42rem);min-height:100vh}main{max-width:1100px;margin:auto;padding:3rem 1.25rem 5rem}h1{margin:0;font-size:clamp(2rem,5vw,3.5rem)}.intro{color:#aab7c4;margin:.5rem 0 2rem}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:.7rem;margin-bottom:2rem}.metric,.report,.finding,.empty{background:#171d24;border:1px solid #2c3743;border-radius:12px}.metric{padding:1rem}.metric b{display:block;font-size:1.7rem}.metric span,.report p,.location{color:#aab7c4;font-size:.85rem}.tabs{display:flex;gap:.5rem;overflow:auto;margin-bottom:1rem;padding-bottom:.25rem}.tab{display:flex;align-items:center;gap:.5rem;white-space:nowrap;border:1px solid #2c3743;border-radius:8px;background:#171d24;color:#aab7c4;padding:.55rem .75rem;cursor:pointer}.tab.active{background:#263747;color:#e8edf2;border-color:#5a94bd}.count{min-width:1.25rem;padding:.1rem .35rem;border-radius:99px;background:#a93442;color:#fff;font-size:.75rem;font-weight:700;text-align:center}.report{padding:1.25rem}.report>header,.finding header{display:flex;gap:.7rem;align-items:center;justify-content:space-between}.report h2{margin:0}.report header p{margin:.2rem 0 0}.findings{display:grid;gap:.65rem;margin-top:1rem}.finding{padding:1rem}.finding header{justify-content:flex-start}.location{margin-left:auto;word-break:break-all}.severity{font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:.25rem .45rem;border-radius:99px;background:#48515c}.critical{background:#742b36}.high{background:#784825}.medium{background:#746028}.low{background:#285d69}dl{display:grid;grid-template-columns:max-content 1fr;gap:.55rem 1rem;margin:1rem 0 0}dt{color:#aab7c4}dd{margin:0;min-width:0}code,pre{font:inherit;white-space:pre-wrap;word-break:break-word;color:#d8e4ef}.secret{display:flex;gap:.5rem;align-items:start}.secret button{border:0;background:#263747;color:#cde8ff;border-radius:6px;padding:.25rem .45rem;cursor:pointer}.warning{color:#ffbd66}.empty{text-align:center;padding:2rem}details{margin-top:1rem}summary{cursor:pointer;color:#9fceff}pre{overflow:auto;padding:1rem;background:#0e1217;border-radius:8px}@media(max-width:640px){main{padding-top:2rem}.summary{grid-template-columns:repeat(2,1fr)}.report>header{align-items:flex-start}.finding header{flex-wrap:wrap}.location{margin-left:0;width:100%}dl{grid-template-columns:1fr}dd{margin-bottom:.5rem}}
</style></head><body><main><h1>Security reports</h1><p class="intro">${reports.length} relatório${reports.length === 1 ? "" : "s"} disponível${reports.length === 1 ? "" : "is"} · ${findings.length} achado${findings.length === 1 ? "" : "s"}</p><div class="summary">${counts.map(([level, count]) => `<div class="metric"><span>${level}</span><b>${count}</b></div>`).join("")}</div>${content}</main><script>document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{const index=tab.dataset.tab;document.querySelectorAll('.tab').forEach(item=>{const active=item===tab;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active))});document.querySelectorAll('[role="tabpanel"]').forEach(panel=>panel.hidden=panel.id!=='report-'+index)}));document.querySelectorAll('.secret button').forEach(button=>button.addEventListener('click',()=>{const value=button.nextElementSibling;value.hidden=!value.hidden;button.setAttribute('aria-label',value.hidden?'Mostrar valor':'Ocultar valor')}))</script></body></html>`;
}

export function register(registry: ActionRegistry): void {
  registry.register("buildReportsDashboard", async (context, args, manifest) => {
    if (args.length) throw new Error("reports:dashboard accepts no arguments.");
    const outputPath = manifest?.output
      ? join(context.dockerDevDirectory, manifest.output.file)
      : undefined;
    if (!outputPath) throw new Error("The reports dashboard declares no output file.");

    const reportsDirectory = join(context.dockerDevDirectory, "reports");
    const reports: Report[] = [];
    try {
      const entries = await readdir(reportsDirectory, { withFileTypes: true });
      for (const entry of entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))) {
        try {
          reports.push(parseReport(entry.name, JSON.parse(await readFile(join(reportsDirectory, entry.name), "utf8"))));
        } catch (error) {
          reports.push({ file: entry.name, title: entry.name.replace(/\.json$/, ""), findings: [], warning: `Não foi possível ler este JSON: ${error instanceof Error ? error.message : "erro desconhecido"}` });
        }
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, renderDashboard(reports));
  });
}
