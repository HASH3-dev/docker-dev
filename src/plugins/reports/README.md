# Reports

`docker-dev reports:dashboard` creates `.docker-dev/reports/dashboard.html` from every JSON report available in `.docker-dev/reports`.

Dashboard is self-contained and ignores absent reports. Invalid or unknown JSON stays isolated from other reports. Gitleaks values are included but hidden until opened with eye button. Do not share generated dashboard without reviewing secrets.
