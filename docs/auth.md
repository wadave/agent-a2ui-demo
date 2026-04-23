# Authentication & Authorization Guide

This document outlines the two distinct authentication strategies employed by the Workspace Demo Agent to ensure smooth local iteration and secure production deployment.

---

## 1. Local Development (The CLI Path)

By default, local execution leverages the standalone **`gws` executable binary** wrapper architecture.

### How it works:
* The system executes commands via `subprocess.run(['gws', ...])`.
* Access privileges rely on standard end-user credential exchanges.

### Setup steps:
Ensure your identity is cached locally:
```bash
gws login
```

*Tokens are stored securely under `~/.config/gws/`.*

---

## 2. Production Deployment (The SDK & ADC Path)

When packaged and uploaded to **Cloud Run**, the application pivots to standard Python API libraries.

### How it works:
* Checks for the internal Cloud Run `K_SERVICE` environment flag.
* Invokes `google.auth.default()` to extract access parameters.

### Setup steps:
1. Identify your deployment's Service Account email (e.g., `xxx-compute@developer.gserviceaccount.com`).
2. Explicitly share target folders or assets with this identity via Drive settings.

---

## 3. Forcing Environments

To execute cloud logic locally, use environmental overrides:
```bash
export USE_ADC="TRUE"
```
