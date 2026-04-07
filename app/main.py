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

"""Main entry point for the A2A A2UI sample agent."""

import os
from pathlib import Path

import uvicorn
from a2a.server import tasks
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, RedirectResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app.agent import RestaurantFinderAgent
from app.agent_executor import RestaurantFinderExecutor
from app.config import AGENT_URL, get_google_maps_api_key

# 1. Create the Agent, AgentCard, RequestHandler, and App.
agent = RestaurantFinderAgent(base_url=AGENT_URL)
agent_card = agent.agent_card

executor = RestaurantFinderExecutor(base_url=AGENT_URL, agent=agent)

request_handler = DefaultRequestHandler(
    agent_executor=executor,
    task_store=tasks.InMemoryTaskStore(),
)

# 2. The Functions Framework will automatically look for this 'app' variable.
app = A2AStarletteApplication(
    agent_card=agent_card,
    http_handler=request_handler,
).build()


_ALLOWED_EMBED_MODES = {"place", "directions", "search", "view"}


async def maps_embed_handler(request):
    """Proxy endpoint that redirects to Google Maps Embed API with the real key.

    The LLM constructs URLs like /maps/embed?mode=place&q=... without any
    API key. This endpoint adds the key and redirects to the real embed URL.
    """
    mode = request.query_params.get("mode", "place")
    if mode not in _ALLOWED_EMBED_MODES:
        return JSONResponse({"error": f"Invalid mode: {mode}"}, status_code=400)

    api_key = get_google_maps_api_key()
    if not api_key:
        return JSONResponse({"error": "Maps API key not configured"}, status_code=500)

    # Preserve the original query string (minus the mode param) to avoid
    # any re-encoding issues with URL-encoded values.
    raw_qs = str(request.query_params)
    # Remove mode=... from the query string
    parts = [p for p in raw_qs.split("&") if not p.startswith("mode=")]
    remaining_qs = "&".join(parts)
    url = f"https://www.google.com/maps/embed/v1/{mode}?key={api_key}"
    if remaining_qs:
        url += f"&{remaining_qs}"
    return RedirectResponse(url=url)


async def feedback_handler(request):
    """Dummy feedback handler for tests."""
    return JSONResponse({"status": "ok"})


app.routes.append(Route("/maps/embed", maps_embed_handler))
app.routes.append(Route("/feedback", feedback_handler, methods=["POST"]))

# CORS: restrict to known origins to prevent the /maps/embed proxy from
# being abused as an open API-key relay by third-party sites.
_cors_origins = [
    "http://localhost:5173",  # Vite frontend dev server
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8080",
]
if AGENT_URL and AGENT_URL not in _cors_origins:
    _cors_origins.append(AGENT_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the built frontend if it exists
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.routes.append(
        Mount("/", app=StaticFiles(directory=str(frontend_dist), html=True))
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
