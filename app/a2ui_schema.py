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


# A2UI v0.8 schema definition.
# Each message MUST contain exactly ONE action key:
# "beginRendering", "surfaceUpdate", "dataModelUpdate", or "deleteSurface".
A2UI_SCHEMA = r"""
{
  "title": "A2UI v0.8 Message Schema",
  "description": "A single A2UI v0.8 message. Must contain exactly one action key.",
  "type": "object",
  "properties": {
    "beginRendering": {
      "type": "object",
      "description": "Initializes a new rendering surface.",
      "required": ["surfaceId", "root"],
      "properties": {
        "surfaceId": {"type": "string"},
        "root": {"type": "string"}
      }
    },
    "surfaceUpdate": {
      "type": "object",
      "description": "Defines or updates the component tree for a surface.",
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
                "type": "object",
                "description": "A single-key object where the key is the component type (e.g. Text, Button) and the value is its properties."
              },
              "weight": {"type": "number"}
            }
          }
        }
      }
    },
    "dataModelUpdate": {
      "type": "object",
      "description": "Updates the data model for a surface.",
      "required": ["surfaceId", "contents"],
      "properties": {
        "surfaceId": {"type": "string"},
        "path": {"type": "string"},
        "contents": {"type": "array"}
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
