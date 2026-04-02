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
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from app.agent import RestaurantFinderAgent
from app.agent_executor import RestaurantFinderExecutor
from app.config import AGENT_URL

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


async def feedback_handler(request):
    """Dummy feedback handler for tests."""
    return JSONResponse({"status": "ok"})


app.routes.append(Route("/feedback", feedback_handler, methods=["POST"]))

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
