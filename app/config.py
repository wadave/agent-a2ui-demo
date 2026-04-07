# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Centralized configuration for the restaurant finder agent.

All environment-driven settings live here. For local development, values
are loaded from a `.env` file via ``dotenv``. For deployment, they are
injected as environment variables (see Makefile ``deploy`` target and
Cloud Build configs).
"""

import logging
import os
from urllib.parse import quote

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Google Cloud
# ---------------------------------------------------------------------------
GOOGLE_CLOUD_PROJECT: str | None = os.getenv("GOOGLE_CLOUD_PROJECT")
GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
A2UI_EXTENSION_URI = "https://a2ui.org/a2a-extension/a2ui/v0.8"

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
DEFAULT_MODEL: str = os.getenv("MODEL", "gemini-3-flash-preview")

# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
AGENT_URL: str = os.getenv("AGENT_URL", "http://127.0.0.1:8000")

# ---------------------------------------------------------------------------
# Google Maps
# ---------------------------------------------------------------------------
_MAPS_SECRET_NAME: str = os.getenv("GOOGLE_MAPS_SECRET_NAME", "google_map_api_key")


_cached_maps_api_key: str | None = None


def get_google_maps_api_key() -> str | None:
    """Fetch Google Maps API key from env var or Secret Manager."""
    global _cached_maps_api_key
    if _cached_maps_api_key is not None:
        return _cached_maps_api_key

    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if api_key:
        _cached_maps_api_key = api_key
        return api_key

    if not GOOGLE_CLOUD_PROJECT:
        logger.warning("GOOGLE_CLOUD_PROJECT not set; cannot fetch Maps API key")
        return None

    try:
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        name = (
            f"projects/{GOOGLE_CLOUD_PROJECT}"
            f"/secrets/{_MAPS_SECRET_NAME}/versions/latest"
        )
        response = client.access_secret_version(request={"name": name})
        _cached_maps_api_key = response.payload.data.decode("UTF-8")
        return _cached_maps_api_key
    except Exception:
        logger.warning(
            "Failed to fetch Maps API key from Secret Manager", exc_info=True
        )
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def build_vertex_model_name(model: str | None = None) -> str:
    """Return a fully-qualified Vertex AI model resource name.

    Falls back to a bare model ID when ``GOOGLE_CLOUD_PROJECT`` is unset
    (e.g. local dev without Vertex).
    """
    model = model or DEFAULT_MODEL
    if GOOGLE_CLOUD_PROJECT:
        return (
            f"projects/{GOOGLE_CLOUD_PROJECT}"
            f"/locations/{GOOGLE_CLOUD_LOCATION}"
            f"/publishers/google/models/{model}"
        )
    return model


def extract_json_from_llm_response(text: str) -> str:
    """Strip optional markdown code fences from an LLM response."""
    text = text.strip()
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        return text[start:end].strip()
    if "```" in text:
        start = text.find("```") + 3
        end = text.find("```", start)
        return text[start:end].strip()
    return text


def build_maps_embed_url(
    *,
    query: str | None = None,
    origin: str | None = None,
    destination: str | None = None,
) -> str | None:
    """Build a Google Maps Embed API URL.

    Returns ``None`` when the API key is unavailable.
    """
    api_key = get_google_maps_api_key()
    if not api_key:
        logger.warning("Google Maps API key not available; cannot build embed URL")
        return None

    base = "https://www.google.com/maps/embed/v1"
    if origin and destination:
        return (
            f"{base}/directions?key={api_key}"
            f"&origin={quote(origin)}&destination={quote(destination)}"
        )
    if query:
        return f"{base}/place?key={api_key}&q={quote(query)}"
    return None
