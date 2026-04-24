# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

locals {
  services = [
    "aiplatform.googleapis.com",
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "bigquery.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "serviceusage.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "telemetry.googleapis.com",
    "discoveryengine.googleapis.com",
    # Workspace APIs called by the runtime SA via google.auth.default()
    # in workspace_tools.py (create_sheet, create_doc, upload_presentation,
    # share_anyone_with_link, gws_call, etc).
    "sheets.googleapis.com",
    "drive.googleapis.com",
    "docs.googleapis.com",
    "slides.googleapis.com",
    # IAM Credentials API: workspace_tools._get_service uses iam.Signer to
    # sign DWD JWTs remotely (no SA key file). Calls
    # iamcredentials.googleapis.com:signBlob on the runtime SA.
    "iamcredentials.googleapis.com",
  ]
}

resource "google_project_service" "services" {
  count              = length(local.services)
  project            = var.dev_project_id
  service            = local.services[count.index]
  disable_on_destroy = false
}

resource "google_project_service_identity" "vertex_sa" {
  provider = google-beta
  project = var.dev_project_id
  service = "aiplatform.googleapis.com"
}
