# Register the A2A agent (Cloud Run) with Gemini Enterprise per environment.
# Terraform manages the full lifecycle — deregisters on destroy to prevent orphan agents.

locals {
  cloud_run_urls = {
    for env, project_id in local.deploy_project_ids :
    env => "https://${var.project_name}-${data.google_project.projects[env].number}.${var.region}.run.app"
  }

  ge_agent_card = {
    for env, url in local.cloud_run_urls :
    env => jsonencode({
      protocolVersion    = "v1.0"
      name               = "A2UI Dashboard Agent"
      description        = "AskIBM sales analytics dashboards based on whitepaper."
      url                = url
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
        ]
      }
      skills = [
        {
          id          = "askibm_whitepaper_dashboards"
          name        = "AskIBM Whitepaper Dashboards"
          description = "Render AskIBM-style sales analytics dashboards."
          tags        = ["analytics", "dashboard"]
        }
      ]
    })
  }
}

module "gemini_enterprise_register" {
  for_each = var.gemini_enterprise_app_id != "" ? local.deploy_project_ids : {}
  source   = "./modules/gemini_enterprise_a2a_register"

  project_id               = each.value
  gemini_enterprise_region = "global"
  gemini_enterprise_app_id = var.gemini_enterprise_app_id

  gemini_enterprise_agent_name = "A2UI Dashboard Agent (${each.key})"
  agent_description            = "A2UI Dashboard Agent on Cloud Run."
  agent_card_json              = local.ge_agent_card[each.key]

  depends_on = [
    google_cloud_run_v2_service.app,
    google_cloud_run_v2_service_iam_member.gemini_enterprise_invoker,
  ]
}
