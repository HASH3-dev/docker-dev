import Handlebars from "handlebars";
import hljs from "highlight.js";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { Report } from "../reports";

import dashboardTemplate from "./dashboard.html" with { type: "text" };
import findingTemplate from "./finding.html" with { type: "text" };
import ignoredFindingTemplate from "./ignored-finding.html" with { type: "text" };

export type Ignore = {
  id: string;
  comment: string;
  createdAt: string;
};

type IdentifiedFinding = Report["findings"][number] & { id: string };
type Detail = { key: string; valueHtml: string };
type FindingView = {
  id: string;
  severity: string;
  title: string;
  locationHtml?: string;
  details: Detail[];
};

type IgnoredFindingView = FindingView & Ignore;

const safeMarkdownTags = [
  "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "li", "ol", "p", "pre", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
];

const sanitize = (html: string): string => sanitizeHtml(html, {
  allowedTags: safeMarkdownTags,
  allowedAttributes: { a: ["href", "title"], code: ["class"], span: ["class"] },
  allowedSchemes: ["http", "https", "mailto", "vscode"],
  allowedSchemesByTag: { a: ["http", "https", "mailto", "vscode"] },
});

const markdownRenderer = new marked.Renderer();
markdownRenderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const html = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  return `<pre><code class="hljs${language ? ` language-${language}` : ""}">${html}</code></pre>`;
};

function renderMarkdown(value: string): string {
  return sanitize(marked.parse(value, { renderer: markdownRenderer, gfm: true, breaks: true }) as string);
}

function renderJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2) ?? "null";
  return `<pre><code class="hljs language-json">${hljs.highlight(json, { language: "json" }).value}</code></pre>`;
}

function isSecret(key: string): boolean {
  return key === "Secret" || key === "Match";
}

function renderCode(value: string, language?: string): string {
  const html = language && hljs.getLanguage(language)
    ? hljs.highlight(value, { language }).value
    : hljs.highlightAuto(value).value;
  return `<pre><code class="hljs${language ? ` language-${language}` : ""}">${html}</code></pre>`;
}

function languageForLocation(location?: string): string | undefined {
  const file = location?.replace(/:\d+$/, "");
  const extension = file?.split(".").pop()?.toLowerCase();
  return {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    py: "python",
    rb: "ruby",
    java: "java",
    go: "go",
    rs: "rust",
    css: "css",
    html: "xml",
    htm: "xml",
    md: "markdown",
  }[extension ?? ""];
}

function isSeverityBadgeKey(key: string): boolean {
  return ["Confidence", "Likelihood", "Impact"].includes(key);
}

function renderSeverityBadge(value: string): string | null {
  const normalized = value.toLowerCase();
  if (["critical", "high", "medium", "low"].includes(normalized)) {
    return `<span class="severity ${normalized}">${normalized}</span>`;
  }
  return null;
}

function renderValue(key: string, value: unknown, language?: string): string {
  if (isSecret(key)) {
    const content = typeof value === "string" ? renderMarkdown(value) : renderJson(value);
    return `<details class="secret"><summary>Mostrar valor sensível</summary>${content}</details>`;
  }
  if ((key === "code_extract" || key === "Code extract") && typeof value === "string") {
    return renderCode(value, language);
  }
  if (typeof value === "string") {
    if (isSeverityBadgeKey(key)) {
      const badge = renderSeverityBadge(value);
      if (badge) return badge;
    }
    return `<div class="markdown">${renderMarkdown(value)}</div>`;
  }
  return renderJson(value);
}

function sourceLocation(location: string, projectRoot: string): string {
  const match = /^(.*?)(?::(\d+))?$/.exec(location);
  const file = match?.[1] ?? location;
  const line = match?.[2];
  if (!file || /^https?:\/\//i.test(file)) return `<a href="${escapeAttribute(location)}">${escapeHtml(location)}</a>`;
  const absolute = file.startsWith("/") ? file : `${projectRoot}/${file}`;
  const target = line ? `${absolute}:${line}` : absolute;
  return `<a href="vscode://file/${encodeURI(target)}">${escapeHtml(location)}</a>`;
}

function escapeHtml(value: string): string {
  return Handlebars.escapeExpression(value);
}

function escapeAttribute(value: string): string {
  return Handlebars.escapeExpression(value);
}

function findingView(finding: IdentifiedFinding, projectRoot: string): FindingView {
  return {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    locationHtml: finding.location ? sourceLocation(finding.location, projectRoot) : undefined,
    details: finding.details.map(([key, value]) => ({
      key,
      valueHtml: renderValue(key, value, languageForLocation(finding.location)),
    })),
  };
}

const template = Handlebars.compile(dashboardTemplate);
const partialFinding = Handlebars.compile(findingTemplate);
const partialIgnoredFinding = Handlebars.compile(ignoredFindingTemplate);
Handlebars.registerPartial("finding", partialFinding);
Handlebars.registerPartial("ignoredFinding", partialIgnoredFinding);

export function renderDashboard(reports: Report[], ignores: Ignore[], projectRoot: string): string {
  const ignoredById = new Map(ignores.map((ignore) => [ignore.id, ignore]));
  const reportViews = reports.map((report, index) => {
    const findings = report.findings as IdentifiedFinding[];
    const ignoredFindings: IgnoredFindingView[] = [];
    const activeFindings: FindingView[] = [];
    for (const finding of findings) {
      const ignore = ignoredById.get(finding.id);
      if (ignore) ignoredFindings.push({ ...findingView(finding, projectRoot), ...ignore });
      else activeFindings.push(findingView(finding, projectRoot));
    }
    const scanner = report.file.replace(/\.json$/, "");
    return {
      index,
      active: index === 0,
      file: report.file,
      title: report.title,
      scanner,
      warning: report.warning,
      rawHtml: report.raw === undefined ? undefined : renderJson(report.raw),
      activeFindings,
      activePlural: activeFindings.length === 1 ? "" : "s",
      ignoredFindings,
      ignoredPlural: ignoredFindings.length === 1 ? "" : "s",
    };
  });
  const activeFindings = reportViews.flatMap((report) => report.activeFindings);
  const levels = ["critical", "high", "medium", "low", "unknown"];

  return template({
    reports: reportViews,
    reportCount: reports.length,
    reportPlural: reports.length === 1 ? "" : "s",
    findingCount: activeFindings.length,
    findingPlural: activeFindings.length === 1 ? "" : "s",
    summary: levels.map((level) => ({ level, count: activeFindings.filter((finding) => finding.severity === level).length })),
  });
}

export const dashboardTemplates = { dashboardTemplate, findingTemplate, ignoredFindingTemplate };
