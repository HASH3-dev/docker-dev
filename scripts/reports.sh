#!/usr/bin/env bash
./docker-dev trivy:scan --no-fail &&
./docker-dev trivy:scan-iac --no-fail &&
./docker-dev trivy:scan-images --no-fail &&
./docker-dev semgrep:scan --no-fail &&
./docker-dev bearer:scan --no-fail &&
./docker-dev gitleaks:scan --no-fail &&
./docker-dev reports:dashboard --port 8081
