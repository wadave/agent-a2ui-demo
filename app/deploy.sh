#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
if [[ "$#" -lt 2 ]]; then
    echo "Usage: $0   [MODEL_NAME]"
    echo "MODEL_NAME is optional and defaults to the configured default in config.py."
    exit 1
fi

PROJECT_ID=$1
SERVICE_NAME=$2
MODEL_NAME=${3}
ENV_VARS="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$VERTEX_LOCATION,GOOGLE_GENAI_USE_VERTEXAI=TRUE"
if [[ -n "$MODEL_NAME" ]]; then
    ENV_VARS="$ENV_VARS,MODEL=$MODEL_NAME"
fi

# Cloud Run region (where the container runs).
REGION="us-central1"

# Vertex AI location for Gemini API calls. gemini-3.x models are only
# served from the global endpoint; using a regional value here will cause
# 404s for those models.
VERTEX_LOCATION="global"

# The memory to allocate to the service
MEMORY="1Gi"

# --- Deployment ---

echo "Starting deployment of service '$SERVICE_NAME' to project '$PROJECT_ID' in region '$REGION' with model '$MODEL_NAME'..."

# Deploy to Cloud Run from source code
# Source is the project root (parent of this script) so the Dockerfile is found
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

gcloud run deploy "$SERVICE_NAME" \
--source "$PROJECT_ROOT" \
--clear-base-image \
--project "$PROJECT_ID" \
--region "$REGION" \
--memory "$MEMORY" \
--no-allow-unauthenticated \
--set-env-vars="$ENV_VARS"

echo "Deployment complete."
echo "Service URL: $(gcloud run services describe "$SERVICE_NAME" \
--platform managed \
--region "$REGION" \
--project "$PROJECT_ID" \
--format 'value(status.url)')"

# After the initial deployment, get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
--project="$PROJECT_ID" \
--region="$REGION" \
--format='value(status.url)')

# Update the service to set the AGENT_URL environment variable
echo "Updating service with its public URL: $SERVICE_URL"
gcloud run services update "$SERVICE_NAME" \
--project="$PROJECT_ID" \
--region="$REGION" \
--update-env-vars=AGENT_URL="$SERVICE_URL"

echo "Deployment Complete!"
echo "Agent URL: ${SERVICE_URL}"
