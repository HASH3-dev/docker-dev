import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBearer } from "./parsers/bearer";
import { parseGitleaks } from "./parsers/gitleaks";
import { parseSemgrep } from "./parsers/semgrep";
import { parseTrivy } from "./parsers/trivy";
import type { Finding } from "./parsers/types";

export type Report = {
  file: string;
  title: string;
  findings: Finding[];
  raw?: unknown;
  warning?: string;
};

export function parseReport(file: string, value: unknown): Report {
  if (file === "trivy.json" && value && typeof value === "object") {
    return { file, title: "Trivy", findings: parseTrivy(value) };
  }
  if (file === "trivy-iac.json" && value && typeof value === "object") {
    return { file, title: "Trivy IaC", findings: parseTrivy(value) };
  }
  if (file === "trivy-images.json" && value && typeof value === "object") {
    return { file, title: "Trivy Images", findings: parseTrivy(value) };
  }
  if (file === "semgrep.json" && value && typeof value === "object") {
    return { file, title: "Semgrep", findings: parseSemgrep(value) };
  }
  if (file === "gitleaks.json" && Array.isArray(value)) {
    return { file, title: "Gitleaks", findings: parseGitleaks(value) };
  }
  if (file === "bearer.json" && value && typeof value === "object") {
    return { file, title: "Bearer", findings: parseBearer(value) };
  }
  return { file, title: file.replace(/\.json$/, ""), findings: [], raw: value };
}

export async function readReports(reportsDirectory: string): Promise<Report[]> {
  try {
    const entries = await readdir(reportsDirectory, { withFileTypes: true });
    return Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "ignores.json")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        try {
          return parseReport(entry.name, JSON.parse(await readFile(join(reportsDirectory, entry.name), "utf8")));
        } catch (error) {
          return { file: entry.name, title: entry.name.replace(/\.json$/, ""), findings: [], warning: `Não foi possível ler este JSON: ${error instanceof Error ? error.message : "erro desconhecido"}` };
        }
      }));
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function identifyFindings(reports: Report[]): Report[] {
  return reports.map((report) => ({
    ...report,
    findings: report.findings.map((finding, index) => ({
      ...finding,
      id: createHash("sha256").update(JSON.stringify([report.file, index, finding.severity, finding.title, finding.location, finding.details])).digest("hex"),
    })),
  }));
}
