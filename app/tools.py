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

"""Tools for the restaurant finder agent."""

import json
import logging
import os
from urllib.parse import quote

from google import genai
from google.genai import types

from app.config import build_vertex_model_name, extract_json_from_llm_response
from app.prompts import _FIND_RESTAURANTS_INSTRUCTION

logger = logging.getLogger(__name__)


async def find_restaurants(query: str) -> str:
    """Find restaurants using Google Maps grounding.

    Args:
        query: The search query describing what restaurants to find
              (e.g. "5 restaurants near Google PLV office in LA").

    Returns:
        JSON string containing an array of restaurant objects.
    """
    if os.getenv("INTEGRATION_TEST") == "TRUE":
        logger.info("Using mock data for find_restaurants from JSON fixture")
        # Go up one level from app/ to project root, then into tests/integration/fixtures
        fixture_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "tests",
            "integration",
            "fixtures",
            "mock_restaurants.json",
        )
        try:
            with open(fixture_path, encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            logger.error(f"Mock data fixture not found at {fixture_path}")
            return "[]"

    client = genai.Client()

    response = client.models.generate_content(
        model=build_vertex_model_name(),
        contents=f"{_FIND_RESTAURANTS_INSTRUCTION}\n\nUser query: {query}",
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_maps=types.GoogleMaps())],
        ),
    )

    if not response.text:
        return json.dumps([])

    response_text = extract_json_from_llm_response(response.text)

    try:
        parsed = json.loads(response_text)
        if not isinstance(parsed, list):
            parsed = [parsed]
        return json.dumps(parsed)
    except json.JSONDecodeError:
        logger.exception("Failed to parse find_restaurants response: %s", response_text)
        return json.dumps([])


async def get_directions(query: str) -> str:
    """Resolve origin and destination addresses for a directions request.

    Uses Google Maps grounding to resolve place names to full addresses.

    Args:
        query: The route query with origin and destination
              (e.g. "directions from Google PLV office in LA to Playa Provisions").

    Returns:
        JSON string with origin address, destination address, and a Google Maps directions URL.
    """
    client = genai.Client()

    prompt = (
        f"{query}\n\n"
        "Resolve the origin and destination to their full street addresses, "
        "including street number, street name, city, state, and zip code.\n\n"
        "Respond with a JSON object containing:\n"
        '- "origin": full street address of the origin\n'
        '- "destination": full street address of the destination\n'
        '- "origin_name": short name of the origin place\n'
        '- "destination_name": short name of the destination place\n\n'
        "No other text, no markdown fences. Just the JSON object."
    )

    response = client.models.generate_content(
        model=build_vertex_model_name(),
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(google_maps=types.GoogleMaps())],
        ),
    )

    if not response.text:
        return json.dumps({"error": "Failed to resolve addresses"})

    response_text = extract_json_from_llm_response(response.text)

    try:
        data = json.loads(response_text)
        origin = data.get("origin", "")
        destination = data.get("destination", "")
        origin_name = data.get("origin_name", "")
        destination_name = data.get("destination_name", "")
        # Prefix with the place name so co-located POIs (e.g. two restaurants
        # inside the same resort) don't collapse to the same street address.
        origin_query = f"{origin_name}, {origin}".strip(", ").strip() or origin
        destination_query = (
            f"{destination_name}, {destination}".strip(", ").strip() or destination
        )
        data["origin_query"] = origin_query
        data["destination_query"] = destination_query
        if origin_query and destination_query:
            data["directions_url"] = (
                f"https://www.google.com/maps/dir/"
                f"{quote(origin_query)}/{quote(destination_query)}"
            )
        return json.dumps(data)
    except json.JSONDecodeError:
        logger.exception("Failed to parse directions response: %s", response_text)
        return json.dumps({"error": f"Failed to parse response: {response_text}"})
