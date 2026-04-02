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

"""Prompts and schemas for the restaurant finder agent."""

import json

_RESTAURANT_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Restaurant Entry",
    "type": "object",
    "required": ["name", "detail", "rating", "infoLink", "address"],
    "properties": {
        "name": {"type": "string", "description": "The name of the restaurant."},
        "detail": {
            "type": "string",
            "description": "A brief description or specialty of the restaurant.",
        },
        "rating": {
            "type": "string",
            "description": (
                "A visual representation of the rating using star characters "
                "(e.g. \u2605\u2605\u2605\u2605\u2606 for 4 out of 5)."
            ),
            "pattern": "^[\u2605\u2606]+$",
        },
        "infoLink": {
            "type": "string",
            "description": (
                "A Markdown formatted link for more information "
                "(e.g. '[More Info](https://example.com)')."
            ),
        },
        "address": {
            "type": "string",
            "description": "The full physical street address of the restaurant, including city, state, and zip code.",
        },
    },
    "additionalProperties": False,
}

_RESTAURANT_SCHEMA_STR = json.dumps(_RESTAURANT_SCHEMA, indent=2)

_FIND_RESTAURANTS_INSTRUCTION = (
    "You are a location research specialist. Answer with concise, fact-based summaries. "
    "Always leverage Google Maps grounding to retrieve up-to-date place details, "
    "addresses, ratings, hours, and contextual insights. Include source references when available.\n\n"
    "You MUST respond with a valid JSON array of restaurant objects. No other text, no markdown fences.\n\n"
    f"Each object in the array MUST follow this schema:\n{_RESTAURANT_SCHEMA_STR}\n\n"
    "IMPORTANT formatting rules:\n"
    "- rating: Use \u2605 and \u2606 characters only (e.g. \u2605\u2605\u2605\u2605\u2606 for 4/5, "
    "\u2605\u2605\u2605\u2606\u2606 for 3/5). Always use exactly 5 characters.\n"
    "- infoLink: Must be a Markdown link, e.g. '[More Info](https://maps.google.com/...)'\n"
    "- Do NOT include an imageUrl field.\n\n"
    "Example response:\n"
    '[{"name": "Sample Restaurant", "detail": "Known for wood-fired pizza.", '
    '"rating": "\u2605\u2605\u2605\u2605\u2606", '
    '"infoLink": "[More Info](https://maps.google.com/?cid=123)", '
    '"address": "123 Main St, Los Angeles, CA 90012"}]'
)
