import { describe, expect, test } from "bun:test";
import { renderDashboard } from "../src/plugins/reports/commands/dashboard/command";

describe("reports dashboard", () => {
  test("renders reports as tabs with finding counts", () => {
    const html = renderDashboard([
      {
        file: "trivy.json",
        title: "Trivy",
        findings: [{ severity: "high", title: "CVE-1", details: [] }],
      },
      {
        file: "unknown.json",
        title: "unknown",
        findings: [],
        raw: { safe: true },
      },
      {
        file: "invalid.json",
        title: "invalid",
        findings: [],
        warning: "JSON inválido",
      },
    ]);

    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="tab-0"');
    expect(html).toContain('id="tab-1"');
    expect(html).toContain('id="report-0"');
    expect(html).toContain('id="report-1" aria-labelledby="tab-1" hidden');
    expect(html).toContain('class="count">1</span>');
    expect(html.match(/class="count">0<\/span>/g)).toHaveLength(2);
    expect(html).toContain("JSON bruto");
    expect(html).toContain("JSON inválido");
  });
});
