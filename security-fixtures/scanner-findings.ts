/*
 * Fixture local para validar os relatórios de Semgrep e Gitleaks.
 *
 * Nunca execute este código, não use os valores como credenciais e não faça
 * commit deste arquivo. Os padrões abaixo são deliberadamente inseguros para
 * que os scanners tenham achados para exibir no dashboard.
 */

import { exec } from "node:child_process";

const userControlledCommand = process.argv[2] ?? "echo scanner fixture";

// Semgrep: execução de comando com entrada controlada pelo usuário.
exec(userControlledCommand);

// Semgrep: execução dinâmica de código.
eval("console.log('scanner fixture')");

// Gitleaks: token GitHub sintético e inválido, usado apenas para detecção.
const fakeGitHubToken = "ghp_123456789012345678901234567890123456";

console.log(fakeGitHubToken.length);
