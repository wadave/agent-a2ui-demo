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

### Why Domain-Wide Delegation

Two separate Workspace constraints push toward DWD:

1. **Cloud Run's metadata server only ever issues tokens with the `cloud-platform` scope.** Workspace APIs (Drive/Sheets/Docs/Slides) gate on OAuth scopes, not IAM, and reject `cloud-platform`-only tokens with a misleading `403 "The caller does not have permission"`.
2. **Service accounts have zero Drive storage quota in Workspace orgs.** Even with the correct OAuth scopes, the SA cannot create files anywhere — the Sheets/Docs APIs return the same generic 403, but the Drive API exposes the real error: `"The user's Drive storage quota has been exceeded"`.

The fix is **Domain-Wide Delegation**: a Workspace admin authorizes the SA to act on behalf of real users in the domain. The agent uses an IAM Signer to mint a JWT (no SA key file required) and exchanges it for a token with `subject=<workspace-user-email>`. Files created by the agent appear in *that user's* Drive and consume *that user's* storage quota.

Required: the SA holds `roles/iam.serviceAccountTokenCreator` on its own resource (used by IAM Signer to remotely sign the JWT — see step 3), and the workspace admin has authorized the SA's OAuth Client ID for the required scopes (see step 4).

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

3. **Grant the SA permission to act as itself (for IAM Signer).** The IAM Signer pattern used by `_get_service` calls `iamcredentials.googleapis.com:signBlob` with the SA as both source and target — this requires `roles/iam.serviceAccountTokenCreator` on the SA's own resource.

   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     <SA_EMAIL> \
     --member="serviceAccount:<SA_EMAIL>" \
     --role="roles/iam.serviceAccountTokenCreator" \
     --project=<your-cloud-run-project-id>
   ```

4. **Authorize the SA in admin.google.com (Domain-Wide Delegation).** This is the gate that lets the SA mint tokens with `subject=<workspace-user>`. Skip it and you get `unauthorized_client: Client is unauthorized to retrieve access tokens using this method` from the OAuth token endpoint.

   1. Get the SA's numeric OAuth Client ID (different from the email):

      ```bash
      gcloud iam service-accounts describe <SA_EMAIL> \
        --project=<your-cloud-run-project-id> \
        --format='value(oauth2ClientId)'
      ```

   2. In [admin.google.com](https://admin.google.com): **Security → Access and data control → API controls → Manage Domain Wide Delegation → Add new**.
   3. Paste the OAuth Client ID and the comma-separated scopes:

      ```text
      https://www.googleapis.com/auth/drive,
      https://www.googleapis.com/auth/spreadsheets,
      https://www.googleapis.com/auth/documents,
      https://www.googleapis.com/auth/presentations
      ```

   4. Click **Authorize**. Propagation is usually < 60s.

5. **Set `WORKSPACE_USER_EMAIL` on the Cloud Run service.** This is the Workspace user the SA acts as. Files appear in their Drive and count against their quota.

   The Makefile's deploy target sets this env var (`WORKSPACE_USER_EMAIL=<email>` in the comma-separated `--update-env-vars` list). For one-off overrides:

   ```bash
   gcloud run services update agent-a2ui-skill-demo \
     --region=us-central1 --project=<your-cloud-run-project-id> \
     --update-env-vars="WORKSPACE_USER_EMAIL=<workspace-user@your-domain.com>"
   ```

   Without this env var, the agent fails fast at startup of any workspace tool with a `RuntimeError` pointing back to this section.

6. **(Optional) Share target folders with the workspace user, not the SA.** Since files now belong to the impersonated user, folder sharing follows their identity — usually nothing extra is needed if the user already owns the destination folder.

---

## 3. Forcing Environments

To execute cloud logic locally, use environmental overrides:

```bash
export USE_ADC="TRUE"
```
