# Register the A2A agent (Cloud Run) with Gemini Enterprise.
# Terraform manages the full lifecycle — deregisters on destroy to prevent orphan agents.

locals {
  cloud_run_url = "https://${var.project_name}-${data.google_project.dev_project.number}.${var.region}.run.app"

  ge_agent_card = jsonencode({
    protocolVersion    = "v1.0"
    name               = "Restaurant Finder Agent"
    description        = "A sample restaurant finder for you!"
    url                = local.cloud_run_url
    version            = "1.0.0"
    defaultInputModes  = ["text/plain"]
    defaultOutputModes = ["text/plain"]
    capabilities = {
      streaming = true
      extensions = [
        {
          uri         = "https://a2ui.org/a2a-extension/a2ui/v0.9"
          description = "Ability to render A2UI v0.9 rich components"
          required    = false
          params = {
            supportedCatalogIds = [
              "https://a2ui.org/specification/v0_9/basic_catalog.json"
            ]
          }
        },
        {
          uri         = "https://a2ui.org/a2a-extension/a2ui/v0.8"
          description = "Ability to render A2UI v0.8 rich components"
          required    = false
          params = {
            supportedCatalogIds = [
              "https://a2ui.org/specification/v0_8/standard_catalog_definition.json"
            ]
          }
        },
      ]
    }
    skills = [
      {
        id          = "restaurant_lookup"
        name        = "Restaurant Lookup"
        description = "Find restaurants and view their details."
        tags        = ["restaurant", "food"]
      }
    ]
  })
}

module "gemini_enterprise_register" {
  count  = var.gemini_enterprise_app_id != "" ? 1 : 0
  source = "../modules/gemini_enterprise_a2a_register"

  project_id               = var.dev_project_id
  gemini_enterprise_region = "global"
  gemini_enterprise_app_id = var.gemini_enterprise_app_id

  gemini_enterprise_agent_name = "Restaurant Finder Agent (dev)"
  agent_description            = "A2UI restaurant finder agent on Cloud Run."
  agent_card_json              = local.ge_agent_card

  depends_on = [
    google_cloud_run_v2_service.app,
    google_cloud_run_v2_service_iam_member.gemini_enterprise_invoker,
  ]
}
