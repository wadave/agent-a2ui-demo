
# ==============================================================================
# Installation & Setup
# ==============================================================================

# Install dependencies using uv package manager
install:
	@command -v uv >/dev/null 2>&1 || { echo "uv is not installed. Installing uv..."; curl -LsSf https://astral.sh/uv/0.8.13/install.sh | sh; source $HOME/.local/bin/env; }
	uv sync

# ==============================================================================
# Frontend (Lit A2UI Shell)
# ==============================================================================

# Install frontend dependencies
frontend-install:
	cd frontend && npm install

# Launch frontend dev server (connects to backend via proxy)
frontend-dev: frontend-install
	cd frontend && npx vite

# Build frontend for production
frontend-build: frontend-install
	cd frontend && npx vite build

# ==============================================================================
# Playground Targets
# ==============================================================================

# Launch local dev playground
playground:
	@echo "==============================================================================="
	@echo "| 🚀 Starting your agent playground...                                        |"
	@echo "|                                                                             |"
	@echo "| 💡 Try asking: What's the weather in San Francisco?                         |"
	@echo "|                                                                             |"
	@echo "| 🔍 IMPORTANT: Select the 'app' folder to interact with your agent.          |"
	@echo "==============================================================================="
	uv run adk web . --port 8501 --reload_agents

# ==============================================================================
# Local Development Commands
# ==============================================================================

# Launch local development server with hot-reload
# Usage: make local-backend [PORT=8000] - Specify PORT for parallel scenario testing
local-backend:
	uv run uvicorn app.main:app --host 0.0.0.0 --port $(or $(PORT),8000) --reload

# Build and run Docker image locally (matches Cloud Run environment)
# Usage: make local-docker [PORT=8080]
local-docker: local-docker-build local-docker-run

local-docker-build:
	docker build -t agent-a2ui-demo .

local-docker-run:
	@echo "==============================================================================="
	@echo "| Running Docker container locally (same as Cloud Run)                        |"
	@echo "| http://localhost:$(or $(PORT),8080)                                              |"
	@echo "==============================================================================="
	docker run --rm -p $(or $(PORT),8080):8080 \
		-e GOOGLE_CLOUD_PROJECT=$$(gcloud config get-value project 2>/dev/null) \
		-e GOOGLE_CLOUD_LOCATION=global \
		-e GOOGLE_GENAI_USE_VERTEXAI=true \
		-e GOOGLE_APPLICATION_CREDENTIALS=/tmp/keys/adc.json \
		-v $$HOME/.config/gcloud/application_default_credentials.json:/tmp/keys/adc.json:ro \
		agent-a2ui-demo

# ==============================================================================
# A2A Protocol Inspector
# ==============================================================================

# Launch A2A Protocol Inspector to test your agent implementation
inspector: setup-inspector-if-needed build-inspector-if-needed
	@echo "==============================================================================="
	@echo "| 🔍 A2A Protocol Inspector                                                  |"
	@echo "==============================================================================="
	@echo "| 🌐 Inspector UI: http://localhost:5001                                     |"
	@echo "|                                                                             |"
	@echo "| 💡 Testing Locally:                                                         |"
	@echo "|    Paste this URL into the inspector:                                      |"
	@echo "|    http://localhost:8000/a2a/app/.well-known/agent-card.json              |"
	@echo "|                                                                             |"
	@echo "| 💡 Testing Remote Deployment:                                               |"
	@echo "|    <SERVICE_URL>/a2a/app/.well-known/agent-card.json"
	@echo "|    (Get SERVICE_URL from 'make deploy' output or Cloud Console)            |"
	@echo "|                                                                             |"
	@echo "|    🔐 Auth: Expand 'Authentication & Headers', select 'Bearer Token',       |"
	@echo "|       and paste output of: gcloud auth print-identity-token                |"
	@echo "==============================================================================="
	@echo ""
	cd tools/a2a-inspector/backend && uv run app.py

# Internal: Setup inspector if not already present (runs once)
# TODO: Update to --branch v1.0.0 when a2a-inspector publishes releases
setup-inspector-if-needed:
	@if [ ! -d "tools/a2a-inspector" ]; then \
		echo "" && \
		echo "📦 First-time setup: Installing A2A Inspector..." && \
		echo "" && \
		mkdir -p tools && \
		git clone --quiet https://github.com/a2aproject/a2a-inspector.git tools/a2a-inspector && \
		(cd tools/a2a-inspector && git -c advice.detachedHead=false checkout --quiet 893e4062f6fbd85a8369228ce862ebbf4a025694) && \
		echo "📥 Installing Python dependencies..." && \
		(cd tools/a2a-inspector && uv sync --quiet) && \
		echo "📥 Installing Node.js dependencies..." && \
		(cd tools/a2a-inspector/frontend && npm install --silent) && \
		echo "🔨 Building frontend..." && \
		(cd tools/a2a-inspector/frontend && npm run build --silent) && \
		echo "" && \
		echo "✅ A2A Inspector setup complete!" && \
		echo ""; \
	fi

# Internal: Build inspector frontend if needed
build-inspector-if-needed:
	@if [ -d "tools/a2a-inspector" ] && [ ! -f "tools/a2a-inspector/frontend/public/script.js" ]; then \
		echo "🔨 Building inspector frontend..."; \
		cd tools/a2a-inspector/frontend && npm run build; \
	fi

# ==============================================================================
# Backend Deployment Targets
# ==============================================================================

# Deploy the agent remotely
# Usage: make deploy [IAP=true] [PORT=8080] - Set IAP=true to enable Identity-Aware Proxy, PORT to specify container port
deploy:
	PROJECT_ID=$$(gcloud config get-value project) && \
	PROJECT_NUMBER=$$(gcloud projects describe $$PROJECT_ID --format="value(projectNumber)") && \
	gcloud beta run deploy agent-a2ui-demo \
		--source . \
		--memory "4Gi" \
		--project $$PROJECT_ID \
		--region "us-central1" \
		--no-allow-unauthenticated \
		--no-cpu-throttling \
		--labels "created-by=adk" \
		--update-build-env-vars "AGENT_VERSION=$(shell awk -F'"' '/^version = / {print $$2}' pyproject.toml || echo '0.0.0')" \
		--update-env-vars \
		"APP_URL=https://agent-a2ui-demo-$$PROJECT_NUMBER.us-central1.run.app,AGENT_URL=https://agent-a2ui-demo-$$PROJECT_NUMBER.us-central1.run.app,GOOGLE_CLOUD_PROJECT=$$PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=true,MODEL=gemini-3-flash-preview" \
		$(if $(IAP),--iap) \
		$(if $(PORT),--port=$(PORT))

# Alias for 'make deploy' for backward compatibility
backend: deploy

# ==============================================================================
# Infrastructure Setup
# ==============================================================================

# Set up development environment resources using Terraform
setup-dev-env:
	PROJECT_ID=$$(gcloud config get-value project) && \
	(cd deployment/terraform/dev && terraform init && terraform apply --var-file vars/env.tfvars --var dev_project_id=$$PROJECT_ID --auto-approve)

# ==============================================================================
# Testing & Code Quality
# ==============================================================================

# Run unit and integration tests
test:
	uv sync --dev
	uv run pytest tests/unit && uv run pytest tests/integration

# Test against remote Cloud Run deployment (requires gcloud auth)
# Usage: make test-remote [AGENT_URL=https://your-service.run.app]
test-remote:
	uv sync --dev
	AGENT_URL=$(or $(AGENT_URL),https://agent-a2ui-demo-$$(gcloud projects describe $$(gcloud config get-value project 2>/dev/null) --format="value(projectNumber)" 2>/dev/null).us-central1.run.app) \
	uv run pytest tests/integration/remote_e2e_test.py -v

# ==============================================================================
# Agent Evaluation
# ==============================================================================

# Run agent evaluation using ADK eval
# Usage: make eval [EVALSET=tests/eval/evalsets/basic.evalset.json] [EVAL_CONFIG=tests/eval/eval_config.json]
eval:
	@echo "==============================================================================="
	@echo "| Running Agent Evaluation                                                    |"
	@echo "==============================================================================="
	uv sync --dev --extra eval
	uv run adk eval ./app $${EVALSET:-tests/eval/evalsets/basic.evalset.json} \
		$(if $(EVAL_CONFIG),--config_file_path=$(EVAL_CONFIG),$(if $(wildcard tests/eval/eval_config.json),--config_file_path=tests/eval/eval_config.json,))

# Run evaluation with all evalsets
eval-all:
	@echo "==============================================================================="
	@echo "| Running All Evalsets                                                        |"
	@echo "==============================================================================="
	@for evalset in tests/eval/evalsets/*.evalset.json; do \
		echo ""; \
		echo "▶ Running: $$evalset"; \
		$(MAKE) eval EVALSET=$$evalset || exit 1; \
	done
	@echo ""
	@echo "✅ All evalsets completed"

# Run code quality checks (codespell, ruff, ty)
lint:
	uv sync --dev --extra lint
	uv run codespell
	uv run ruff check . --diff
	uv run ruff format . --check --diff
	uv run ty check .

# ==============================================================================
# Gemini Enterprise Integration
# ==============================================================================

# Register the deployed agent to Gemini Enterprise
# Usage: make register-gemini-enterprise (interactive - will prompt for required details)
# For non-interactive use, set env vars: ID or GEMINI_ENTERPRISE_APP_ID (full GE resource name)
# Optional env vars: GEMINI_DISPLAY_NAME, GEMINI_DESCRIPTION, AGENT_CARD_URL
register-gemini-enterprise:
	@PROJECT_ID=$$(gcloud config get-value project 2>/dev/null) && \
	PROJECT_NUMBER=$$(gcloud projects describe $$PROJECT_ID --format="value(projectNumber)" 2>/dev/null) && \
	uvx agent-starter-pack@0.39.6 register-gemini-enterprise \
		--agent-card-url="https://agent-a2ui-demo-$$PROJECT_NUMBER.us-central1.run.app/.well-known/agent-card.json" \
		--deployment-target="cloud_run" \
		--project-number="$$PROJECT_NUMBER"
