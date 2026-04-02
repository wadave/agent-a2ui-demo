# Create module build directory if missing
resource "null_resource" "create_build_dir_if_missing" {
  provisioner "local-exec" {
    command = "mkdir -p ${path.module}/build"
  }
}

# Generate register/update script
resource "local_file" "out_register_or_update_script" {
  depends_on = [
    null_resource.create_build_dir_if_missing,
  ]
  content         = local.register_or_update_script
  filename        = "${path.module}/build/_register_or_update_a2a_agent.sh"
  file_permission = "0755"
}

# Generate deregister script
resource "local_file" "out_deregister_script" {
  depends_on = [
    null_resource.create_build_dir_if_missing,
  ]
  content         = local.deregister_script
  filename        = "${path.module}/build/_deregister_a2a_agent.sh"
  file_permission = "0755"
}

# Register or update the A2A agent with Gemini Enterprise
resource "null_resource" "register_or_update_a2a_agent" {
  depends_on = [
    local_file.out_register_or_update_script
  ]

  triggers = {
    agent_card_hash = md5(var.agent_card_json)
    description     = var.agent_description
    template_hash   = md5(local.register_or_update_script)
  }

  provisioner "local-exec" {
    command     = "./${path.module}/build/_register_or_update_a2a_agent.sh"
    interpreter = ["/bin/bash", "-c"]
  }
}

# Deregister the A2A agent on destroy — prevents orphan agents in GE
resource "null_resource" "deregister_a2a_agent" {
  triggers = {
    script_body = local.deregister_script
  }

  provisioner "local-exec" {
    when        = destroy
    command     = self.triggers.script_body
    interpreter = ["/bin/bash", "-c"]
  }
}
