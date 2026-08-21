# Reports

`docker-dev reports:dashboard [--port <port>]` starts a live dashboard in the development container. Set the same container port in `.docker-dev/ports.env`, then open `http://127.0.0.1:<port>` on the host. It reads JSON reports and server-renders the HTML template on every browser refresh; no `dashboard.html` is written.

Markdown fields are rendered safely, including highlighted code blocks. Structured JSON and arrays are highlighted, web URLs become links, and file locations open in VS Code at the reported line.

Use the red **Ignore** action at the bottom-right of a finding, with its required comment, to save an ignore in `.docker-dev/reports/ignores.json`. This file is versioned, so the team shares triage decisions. Ignored findings appear first in their own report tab; expand one to inspect its details or use **Remover ignore** to restore it.

Dashboard isolates absent, invalid, and unknown reports. Gitleaks values remain behind an explicit disclosure. Reports may contain secrets; do not expose the local server.
