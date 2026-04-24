# Authentication & Authorization Guide

This document outlines the two distinct authentication strategies employed by the Workspace Demo Agent to ensure smooth local iteration and secure production deployment.

---

## 1. Local Development (The CLI Path)

By default, local execution leverages the standalone **`gws` executable binary** wrapper architecture.

### How it works
* The system executes commands via `subprocess.run(['gws', ...])`.
* Access privileges rely on standard end-user credential exchanges.

### Local setup
Ensure your identity is cached locally:
```bash
gws login
```

*Tokens are stored securely under `~/.config/gws/`.*

---

## 2. Production Deployment (The SDK & ADC Path)

When packaged and uploaded to **Cloud Run**, the application pivots to standard Python API libraries.

### How the SDK path works

* Checks for the internal Cloud Run `K_SERVICE` environment flag.
* Invokes `google.auth.default()` to extract the Cloud Run runtime SA credentials.
* Self-impersonates via the IAM Credentials API to upgrade the token's OAuth scopes from `cloud-platform` to the Workspace scopes (`drive`, `documents`, `spreadsheets`, `presentations`). See `app/workspace_tools.py:_get_service`.

### Why self-impersonation

Cloud Run's metadata server only ever issues tokens with the `cloud-platform` scope, regardless of what `with_scopes()` requests — the upstream `google.auth.compute_engine.Credentials` library notes "the metadata service ignores the scopes parameter." `cloud-platform` is sufficient for IAM-controlled GCP APIs (BigQuery, Vertex, Cloud Storage), but **Workspace APIs gate on OAuth scopes, not IAM**, and reject `cloud-platform`-only tokens with a misleading `403 "The caller does not have permission"`.

The fix is to call the IAM Credentials API to mint a *new* token for the SA *as itself* with the actual Workspace scopes attached. This requires the SA to hold `roles/iam.serviceAccountTokenCreator` on its own resource (see step 3 below).

### Cloud Run setup

1. **Enable the Workspace APIs and the IAM Credentials API in the deploy project.** Without the Workspace APIs, the very first `POST /v4/spreadsheets` (or Docs/Slides/Drive equivalent) returns `403 "The caller does not have permission"` — the message really means "this API isn't turned on for this project." Without `iamcredentials.googleapis.com`, the self-impersonation step in `_get_service` fails before it can issue a scoped token.

   ```bash
   gcloud services enable \
     sheets.googleapis.com \
     drive.googleapis.com \
     docs.googleapis.com \
     slides.googleapis.com \
     iamcredentials.googleapis.com \
     --project=<your-cloud-run-project-id>
   ```

   The same APIs are enabled declaratively via Terraform in `deployment/terraform/locals.tf` (`deploy_project_services`) and `deployment/terraform/dev/apis.tf` — keep them in sync if you add new Workspace surfaces.

2. **Identify your deployment's Service Account email** (e.g., `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`). On Cloud Run this is the runtime SA; you can read it with:

   ```bash
   gcloud run services describe <service-name> \
     --region=<region> --format='value(spec.template.spec.serviceAccountName)'
   ```

3. **Grant the SA permission to impersonate itself.** This is what unlocks the IAM Credentials self-impersonation in `_get_service`. Without this binding, you get `403` from `iamcredentials.googleapis.com` instead of from Sheets/Drive.

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     <SA_EMAIL> \
     --member="serviceAccount:<SA_EMAIL>" \
     --role="roles/iam.serviceAccountTokenCreator" \
     --project=<your-cloud-run-project-id>
   ```

4. **Share target folders or assets with the SA via Drive settings.** This is required only for files the agent needs to *read* or *write into a specific shared location*. Files the SA *creates from scratch* land in the SA's own Drive automatically and require no sharing — but if you want them placed inside a named folder (e.g. `"Documents"`), share that folder with the SA first so the folder lookup at `workspace_tools.py:_get_or_create_folder_adc` can resolve it.

---

## 3. Forcing Environments

To execute cloud logic locally, use environmental overrides:

```bash
export USE_ADC="TRUE"
```
