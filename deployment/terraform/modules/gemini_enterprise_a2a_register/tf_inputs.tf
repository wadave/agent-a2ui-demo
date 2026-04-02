variable "project_id" {
  description = "The GCP project ID."
  type        = string
}

variable "gemini_enterprise_region" {
  description = "Region for Gemini Enterprise (Discovery Engine). Use 'global' for GE apps in global scope."
  type        = string
  default     = "global"
}

variable "gemini_enterprise_app_id" {
  description = "The Gemini Enterprise app (engine) resource ID."
  type        = string
}

variable "gemini_enterprise_agent_name" {
  description = "Display name for the agent in Gemini Enterprise. Used to find/update/delete the agent."
  type        = string
}

variable "agent_description" {
  description = "Description of the agent shown in Gemini Enterprise."
  type        = string
}

variable "agent_card_json" {
  description = "The A2A agent card as a JSON string. Embedded directly in the registration request."
  type        = string
}

variable "collection_id" {
  description = "The Discovery Engine collection ID."
  type        = string
  default     = "default_collection"
}
