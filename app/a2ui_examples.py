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

"""Contains UI examples for Restaurant Finder sample (A2UI v0.9)."""

RESTAURANT_SELECTION_EXAMPLES = r"""
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "restaurant-selection-surface",
      "catalogId": "https://github.com/user/agent-a2ui-skill-demo/restaurant_finder_catalog_definition.json"
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "restaurant-selection-surface",
      "path": "/data/restaurants",
      "value": [
        {
          "name": "Restaurant A",
          "detail": "Known for wood-fired pizza.",
          "rating": "★★★★☆",
          "infoLink": "[More Info](https://maps.google.com/?cid=111)",
          "address": "123 Main St, City, ST 00000"
        },
        {
          "name": "Restaurant B",
          "detail": "Fresh seafood and sushi.",
          "rating": "★★★★★",
          "infoLink": "[More Info](https://maps.google.com/?cid=222)",
          "address": "456 Oak Ave, City, ST 00000"
        },
        {
          "name": "Restaurant C",
          "detail": "Authentic Mexican cuisine.",
          "rating": "★★★☆☆",
          "infoLink": "[More Info](https://maps.google.com/?cid=333)",
          "address": "789 Elm Blvd, City, ST 00000"
        }
      ]
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "restaurant-selection-surface",
      "components": [
        {
          "id": "root",
          "component": "Card",
          "child": "cardContent"
        },
        {
          "id": "cardContent",
          "component": "Column",
          "justify": "start",
          "align": "stretch",
          "children": ["headerText", "restaurantDropdown", "buttonRow"]
        },
        {
          "id": "headerText",
          "component": "Text",
          "variant": "h2",
          "text": "Find your favorite restaurant"
        },
        {
          "id": "restaurantDropdown",
          "component": "ChoicePicker",
          "variant": "multipleSelection",
          "value": { "path": "/form/restaurantSelections" },
          "options": [
            { "label": "Restaurant A", "value": "Restaurant A" },
            { "label": "Restaurant B", "value": "Restaurant B" },
            { "label": "Restaurant C", "value": "Restaurant C" }
          ]
        },
        {
          "id": "buttonRow",
          "component": "Row",
          "justify": "end",
          "children": ["showDetailsButton"]
        },
        {
          "id": "showDetailsButton",
          "component": "Button",
          "child": "showDetailsButtonText",
          "action": {
            "event": {
              "name": "selectRestaurants",
              "context": {
                "selectedRestaurants": { "path": "/form/restaurantSelections" }
              }
            }
          }
        },
        {
          "id": "showDetailsButtonText",
          "component": "Text",
          "text": "Show details"
        }
      ]
    }
  }
]
"""
