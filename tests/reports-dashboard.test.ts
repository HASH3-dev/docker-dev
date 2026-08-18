import { describe, expect, test } from "bun:test";
import {
  parseReport,
  renderDashboard,
} from "../src/plugins/reports/commands/dashboard/command";

describe("reports dashboard", () => {
  test("parses Bearer severity buckets", () => {
    const report = parseReport("bearer.json", {
      high: [{ title: "High finding", filename: "src/high.ts" }],
      medium: [{ title: "Medium finding", filename: "src/medium.ts" }],
      low: [{ title: "Low finding", filename: "src/low.ts" }],
    });
    const html = renderDashboard([report]);

    expect(report.findings).toHaveLength(3);
    expect(html).toContain("3 achados");
    expect(html).toContain('<span>high</span><b>1</b>');
    expect(html).toContain('<span>medium</span><b>1</b>');
    expect(html).toContain('<span>low</span><b>1</b>');
    expect(html).toContain("High finding");
    expect(html).toContain("src/high.ts");
  });

  test("renders reports as tabs with finding counts", () => {
    const html = renderDashboard([
      {
        file: "trivy.json",
        title: "Trivy",
        findings: [
          {
            severity: "high",
            title: "CVE-1",
            details: [["Description", "**Markdown**"]],
          },
        ],
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
    expect(html).toContain('data-markdown>');
    expect(html).toContain("https://cdn.jsdelivr.net/npm/marked/marked.min.js");
    expect(html).toContain("https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js");
    expect(html).toContain("DOMPurify.sanitize(marked.parse(element.textContent))");
  });
});
