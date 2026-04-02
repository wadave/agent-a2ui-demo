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

"""Contains UI examples for Restaurant Finder sample (A2UI v0.8)."""

RESTAURANT_SELECTION_EXAMPLES = r"""
[
  {
    "beginRendering": {
      "surfaceId": "restaurant-selection-surface",
      "root": "root"
    }
  },
  {
    "dataModelUpdate": {
      "surfaceId": "restaurant-selection-surface",
      "path": "/data/restaurants",
      "contents": [
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
    "surfaceUpdate": {
      "surfaceId": "restaurant-selection-surface",
      "components": [
        {
          "id": "root",
          "component": {
            "Card": {
              "child": "cardContent"
            }
          }
        },
        {
          "id": "cardContent",
          "component": {
            "Column": {
              "children": ["headerText", "restaurantDropdown", "buttonRow"],
              "distribution": "start",
              "alignment": "stretch"
            }
          }
        },
        {
          "id": "headerText",
          "component": {
            "Text": {
              "text": {"literalString": "Find your favorite restaurant"},
              "usageHint": "h2"
            }
          }
        },
        {
          "id": "restaurantDropdown",
          "component": {
            "MultipleChoice": {
              "selections": {"path": "/form/restaurantSelections"},
              "options": [
                {"label": {"literalString": "Restaurant A"}, "value": "Restaurant A"},
                {"label": {"literalString": "Restaurant B"}, "value": "Restaurant B"},
                {"label": {"literalString": "Restaurant C"}, "value": "Restaurant C"}
              ],
              "maxAllowedSelections": 3
            }
          }
        },
        {
          "id": "buttonRow",
          "component": {
            "Row": {
              "children": ["showDetailsButton"],
              "distribution": "end"
            }
          }
        },
        {
          "id": "showDetailsButton",
          "component": {
            "Button": {
              "child": "showDetailsButtonText",
              "action": {
                "name": "selectRestaurants",
                "context": [
                  {
                    "key": "selectedRestaurants",
                    "value": {"path": "/form/restaurantSelections"}
                  }
                ]
              }
            }
          }
        },
        {
          "id": "showDetailsButtonText",
          "component": {
            "Text": {
              "text": {"literalString": "Show details"},
              "usageHint": "body"
            }
          }
        }
      ]
    }
  }
]
"""
