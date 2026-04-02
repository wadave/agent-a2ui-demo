# Enable the Discovery Engine API
resource "google_project_service" "discovery_engine_api" {
  project            = var.project_id
  service            = "discoveryengine.googleapis.com"
  disable_on_destroy = false
}
