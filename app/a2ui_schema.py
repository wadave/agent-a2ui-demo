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


# A2UI v0.9 schema definition.
# Each message MUST contain exactly ONE action key plus the version envelope:
# "createSurface", "updateComponents", "updateDataModel", or "deleteSurface".
A2UI_SCHEMA = r"""
{
  "title": "A2UI v0.9 Message Schema",
  "description": "A single A2UI v0.9 message. Must contain a 'version' field plus exactly one action key.",
  "type": "object",
  "required": ["version"],
  "properties": {
    "version": {"const": "v0.9"},
    "createSurface": {
      "type": "object",
      "description": "Initializes a new rendering surface. The component with id 'root' is inferred.",
      "required": ["surfaceId", "catalogId"],
      "properties": {
        "surfaceId": {"type": "string"},
        "catalogId": {"type": "string"},
        "theme": {"type": "object"},
        "sendDataModel": {"type": "boolean"}
      }
    },
    "updateComponents": {
      "type": "object",
      "description": "Defines or updates the component tree for a surface. Exactly one component MUST have id 'root'.",
      "required": ["surfaceId", "components"],
      "properties": {
        "surfaceId": {"type": "string"},
        "components": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "required": ["id", "component"],
            "properties": {
              "id": {"type": "string"},
              "component": {
                "type": "string",
                "description": "The discriminator naming the component type (e.g. 'Text', 'Button', 'Column')."
              },
              "weight": {"type": "number"}
            }
          }
        }
      }
    },
    "updateDataModel": {
      "type": "object",
      "description": "Updates the data model for a surface.",
      "required": ["surfaceId"],
      "properties": {
        "surfaceId": {"type": "string"},
        "path": {"type": "string"},
        "value": {}
      }
    },
    "deleteSurface": {
      "type": "object",
      "required": ["surfaceId"],
      "properties": {
        "surfaceId": {"type": "string"}
      }
    }
  }
}
"""
