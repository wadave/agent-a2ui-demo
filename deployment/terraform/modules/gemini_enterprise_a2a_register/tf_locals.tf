locals {
  register_or_update_script = templatefile("${path.module}/templates/_register_or_update_a2a_agent_tpl.sh", {
    gcp_project                  = var.project_id,
    gemini_enterprise_location   = var.gemini_enterprise_region,
    gemini_enterprise_agent_name = var.gemini_enterprise_agent_name,
    agent_description            = var.agent_description,
    collection_id                = var.collection_id,
    gemini_enterprise_app_id     = var.gemini_enterprise_app_id,
    agent_card_json              = var.agent_card_json,
  })

  deregister_script = templatefile("${path.module}/templates/_deregister_a2a_agent_tpl.sh", {
    gcp_project                  = var.project_id,
    gemini_enterprise_location   = var.gemini_enterprise_region,
    gemini_enterprise_agent_name = var.gemini_enterprise_agent_name,
    collection_id                = var.collection_id,
    gemini_enterprise_app_id     = var.gemini_enterprise_app_id,
  })
}
