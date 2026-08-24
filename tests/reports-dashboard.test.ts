import { describe, expect, test } from "bun:test";
import { parseReport, renderDashboard, scannerActions } from "../src/plugins/reports/commands/dashboard/command";
import { identifyFindings } from "../src/plugins/reports/commands/reports";

describe("reports dashboard", () => {
  test("parses Bearer severity buckets", () => {
    const report = parseReport("bearer.json", {
      high: [{ title: "High finding", filename: "src/high.ts" }],
      medium: [{ title: "Medium finding", filename: "src/medium.ts" }],
      low: [{ title: "Low finding", filename: "src/low.ts" }],
    });

    expect(report.findings).toHaveLength(3);
    expect(report.findings.map((finding) => finding.severity)).toEqual([
      "high",
      "medium",
      "low",
    ]);
    expect(report.findings[0]?.location).toBe("src/high.ts");
  });

  test("formats Bearer detail labels and parses them separately", () => {
    const report = parseReport("bearer.json", {
      low: [{
        title: "Logger leak",
        filename: "src/logger.ts",
        documentation_url: "https://docs.example.test/rules/logger-leak",
        cwe_ids: ["CWE-532"],
      }],
    });

    expect(report.findings[0]?.details).toEqual([
      ["Documentation URL", "https://docs.example.test/rules/logger-leak"],
      ["CWE IDs", ["CWE-532"]],
    ]);
  });

  test("extracts Semgrep metadata fields with formatted labels and normalizes values", () => {
    const report = parseReport("semgrep.json", {
      results: [{
        check_id: "dockerfile.security.missing-user.missing-user",
        path: "src/assets/Dockerfile",
        start: { line: 35 },
        extra: {
          severity: "ERROR",
          message: "Security issue description",
          metadata: {
            cwe: ["CWE-250: Execution with Unnecessary Privileges"],
            category: "security",
            technology: ["dockerfile"],
            confidence: "HIGH",
            owasp: ["A04:2021 - Insecure Design", "A06:2025 - Insecure Design"],
            references: ["https://semgrep.dev/r/dockerfile.security.missing-user.missing-user"],
            subcategory: ["audit"],
            likelihood: "LOW",
            impact: "MEDIUM",
            vulnerability_class: ["Improper Authorization"],
            shortlink: "https://sg.run/Gbvn",
          },
        },
      }],
    });

    const finding = report.findings[0];
    expect(finding?.severity).toBe("high");
    expect(finding?.details.map(([key]) => key)).toEqual([
      "Message",
      "CWE",
      "Category",
      "Technology",
      "Confidence",
      "OWASP",
      "References",
      "Subcategory",
      "Likelihood",
      "Impact",
      "Vulnerability class",
      "Shortlink",
    ]);

    expect(finding?.details.find(([key]) => key === "CWE")?.[1]).toBe(
      "CWE-250: Execution with Unnecessary Privileges",
    );
    expect(finding?.details.find(([key]) => key === "Technology")?.[1]).toBe("dockerfile");
    expect(finding?.details.find(([key]) => key === "References")?.[1]).toBe(
      "[https://semgrep.dev/r/dockerfile.security.missing-user.missing-user](https://semgrep.dev/r/dockerfile.security.missing-user.missing-user)",
    );
    expect(finding?.details.find(([key]) => key === "OWASP")?.[1]).toBe(
      "- A04:2021 - Insecure Design\n- A06:2025 - Insecure Design",
    );
    expect(finding?.details.find(([key]) => key === "Shortlink")?.[1]).toBe(
      "[https://sg.run/Gbvn](https://sg.run/Gbvn)",
    );
  });

  test("normalizes Semgrep array values correctly", () => {
    const report = parseReport("semgrep.json", {
      results: [{
        check_id: "test-rule",
        path: "test.ts",
        start: { line: 1 },
        extra: {
          severity: "WARNING",
          message: "Test",
          metadata: {
            references: [
              "https://example.com/ref1",
              "https://example.com/ref2",
            ],
          },
        },
      }],
    });

    const finding = report.findings[0];
    expect(finding?.severity).toBe("medium");
    expect(finding?.details.find(([key]) => key === "References")?.[1]).toBe(
      "- [https://example.com/ref1](https://example.com/ref1)\n- [https://example.com/ref2](https://example.com/ref2)",
    );
  });

  test("renders Semgrep Confidence, Likelihood and Impact as severity badges", () => {
    const reports = identifyFindings([{
      file: "semgrep.json",
      title: "Semgrep",
      findings: [{
        severity: "high",
        title: "Test finding",
        location: "test.ts:1",
        details: [
          ["Confidence", "HIGH"],
          ["Likelihood", "MEDIUM"],
          ["Impact", "LOW"],
        ],
      }],
    }]);

    const html = renderDashboard(reports, [], "/workspace/project");

    expect(html).toContain('<span class="severity high">high</span>');
    expect(html).toContain('<span class="severity medium">medium</span>');
    expect(html).toContain('<span class="severity low">low</span>');
  });

  test("uses Bearer full_filename and line_number as the finding location", () => {
    const report = parseReport("bearer.json", {
      low: [{
        title: "Logger leak",
        filename: "ignored.ts",
        full_filename: "src/commands/update/command.ts",
        line_number: 32,
      }],
    });

    expect(report.findings[0]?.location).toBe("src/commands/update/command.ts:32");
    expect(report.findings[0]?.details.map(([key]) => key)).not.toContain("full_filename");
    expect(report.findings[0]?.details.map(([key]) => key)).not.toContain("line_number");
  });

  test("resolves relative file locations against the host project path", () => {
    const reports = identifyFindings([{
      file: "bearer.json",
      title: "Bearer",
      findings: [{ severity: "low", title: "Logger leak", location: "src/app.ts:32", details: [] }],
    }]);

    const html = renderDashboard(reports, [], "/home/jaykon/project");

    expect(html).toContain("vscode://file//home/jaykon/project/src/app.ts:32");
  });

  test("parses Trivy IaC misconfigurations", () => {
    const report = parseReport("trivy-iac.json", {
      Results: [{
        Target: "Dockerfile",
        Misconfigurations: [{
          ID: "DS002",
          Severity: "HIGH",
          Title: "Image user should not be root",
          Message: "Specify a non-root USER instruction.",
          Resolution: "Add USER app before CMD.",
          PrimaryURL: "https://avd.aquasec.com/misconfig/ds002",
        }],
      }],
    });

    expect(report.title).toBe("Trivy IaC");
    expect(report.findings).toEqual([{
      severity: "high",
      title: "DS002: Image user should not be root",
      location: "Dockerfile",
      details: [
        ["Message", "Specify a non-root USER instruction."],
        ["Resolution", "Add USER app before CMD."],
        ["Primary URL", "https://avd.aquasec.com/misconfig/ds002"],
      ],
    }]);
  });

  test("maps Trivy IaC and image reports to their commands", () => {
    expect(/^\/api\/rerun\/([a-z][a-z-]*)$/.exec("/api/rerun/trivy-iac")?.[1]).toBe(
      "trivy-iac",
    );
    expect(/^\/api\/rerun\/([a-z][a-z-]*)$/.exec("/api/rerun/trivy-images")?.[1]).toBe(
      "trivy-images",
    );
    expect(scannerActions["trivy-iac"]).toEqual({
      plugin: "trivy",
      action: "scanTrivyIacPath",
      command: "scan-iac",
    });
    expect(scannerActions["trivy-images"]).toEqual({
      plugin: "trivy",
      action: "scanTrivyImages",
      command: "scan-images",
    });
  });

  test("assigns stable IDs to findings", () => {
    const reports = [{
      file: "trivy.json",
      title: "Trivy",
      findings: [{ severity: "high", title: "CVE-1", location: "lock.json", details: [] }],
    }];

    expect(identifyFindings(reports)[0]?.findings[0]?.id).toBe(
      identifyFindings(reports)[0]?.findings[0]?.id,
    );
  });

  test("renders dashboard server-side through HTML templates", () => {
    const reports = identifyFindings([{
      file: "semgrep.json",
      title: "Semgrep",
      findings: [{
        severity: "high",
        title: "Unsafe output",
        location: "src/app.ts:42",
        details: [
          ["Message", "See https://example.test/docs\n\n```ts\nconst unsafe = true;\n```"],
          ["Metadata", { references: ["https://example.test/rule"], enabled: true }],
          ["Code extract", "const unsafe = true;"],
        ],
      }],
    }]);

    const html = renderDashboard(reports, [], "/workspace/project");

    expect(html).toContain("Unsafe output");
    expect(html).toContain("vscode://file//workspace/project/src/app.ts:42");
    expect(html).toContain(">src/app.ts:42</a>");
    expect(html).toContain("https://example.test/docs");
    expect(html).toContain('class="hljs language-ts"');
    expect(html).toContain('class="hljs language-typescript"');
    expect(html).toContain('class="hljs language-json"');
    expect(html).toContain('.hljs-keyword, .hljs-selector-tag');
    expect(html).toContain('#ff79c6');
    expect(html).toContain('class="ignore"');
    expect(html).toContain('command="show-modal"');
    expect(html).toContain('<dialog id="ignore-');
    expect(html).toContain('action="/ignores"');
    expect(html).not.toContain("/api/reports");
  });

  test("shows ignored findings first and expandable in their report tab", () => {
    const reports = identifyFindings([{
      file: "gitleaks.json",
      title: "Gitleaks",
      findings: [{
        severity: "high",
        title: "Credential",
        location: "config.ts:7",
        details: [["Secret", "do-not-display"]],
      }],
    }]);
    const id = reports[0]?.findings[0]?.id ?? "";

    const html = renderDashboard(reports, [{ id, comment: "Test fixture", createdAt: "2026-08-19T00:00:00.000Z" }], "/workspace/project");

    expect(html).toContain('<details class="ignored-findings">');
    expect(html).toContain('<summary><strong>Ignorados</strong> <span class="count">1</span></summary>');
    expect(html).toContain('<details class="ignored-finding">');
    expect(html).toContain("Test fixture");
    expect(html).toContain("Mostrar valor sensível");
    expect(html).toContain(`/ignores/${id}/delete`);
    expect(html.indexOf("Ignorados")).toBeLessThan(html.indexOf("Nenhum achado ativo."));
  });
});
