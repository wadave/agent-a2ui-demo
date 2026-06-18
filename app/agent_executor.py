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

"""Agent executor for GE UI with A2UI extension support."""

import asyncio
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, override
from urllib.parse import parse_qs, urlencode

from a2a.server.agent_execution import RequestContext
from a2a.server.context import ServerCallContext
from a2a.server.events.event_queue import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.types import (
    Artifact,
    DataPart,
    Message,
    MessageSendConfiguration,
    MessageSendParams,
    Part,
    Role,
    Task,
    TaskArtifactUpdateEvent,
    TaskQueryParams,
    TaskState,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)
from a2ui.a2a.extension import try_activate_a2ui_extension
from a2ui.a2a.parts import A2UI_MIME_TYPE, create_a2ui_part
from a2ui.adk.send_a2ui_to_client_toolset import (
    A2uiEventConverter,
)
from a2ui.schema.constants import A2UI_CLIENT_CAPABILITIES_KEY, VERSION_0_8, VERSION_0_9
from google.adk.a2a.converters.request_converter import AgentRunRequest
from google.adk.a2a.converters.utils import _get_adk_metadata_key
from google.adk.a2a.executor.a2a_agent_executor import (
    A2aAgentExecutor,
    A2aAgentExecutorConfig,
)
from google.adk.a2a.executor.executor_context import ExecutorContext
from google.adk.a2a.executor.task_result_aggregator import TaskResultAggregator
from google.adk.a2a.executor.utils import (
    execute_after_agent_interceptors,
    execute_after_event_interceptors,
)
from google.adk.agents.invocation_context import new_invocation_context_id
from google.adk.events.event import Event
from google.adk.events.event_actions import EventActions
from google.adk.platform import time as platform_time
from google.adk.platform import uuid as platform_uuid
from google.adk.runners import Runner
from google.adk.utils.context_utils import Aclosing

from app.agent import RestaurantFinderAgent
from app.config import A2UI_EXTENSION_URI_V0_8, get_google_maps_api_key
from app.session_keys import A2UI_CATALOG_KEY, A2UI_ENABLED_KEY, A2UI_EXAMPLES_KEY

logger = logging.getLogger(__name__)

NATIVE_PROGRESS_HEARTBEAT_INTERVAL_SECS = 0.75
NATIVE_PROGRESS_FINAL_HOLD_SECS = 15.0
NATIVE_PROGRESS_REPLAY_CHECK_SECS = 0.25

# Matches the /maps/embed proxy URL produced by the LLM.
_MAPS_PROXY_RE = re.compile(r"^/maps/embed\?(.+)$")

# A2UI message types that must each travel as their own message.
# Renderers (frontend Lit, Gemini Enterprise) reject a single message that
# contains more than one of these keys. Covers both v0.8 and v0.9 type names.
_A2UI_UPDATE_TYPES = (
    # v0.9
    "createSurface",
    "deleteSurface",
    "updateDataModel",
    "updateComponents",
    # v0.8
    "beginRendering",
    "surfaceUpdate",
    "dataModelUpdate",
)


def _proxy_url_to_full_embed_url(url: str) -> str:
    """Convert /maps/embed?mode=place&q=... to a full Google Maps Embed URL."""
    match = _MAPS_PROXY_RE.match(url)
    if not match:
        return url
    api_key = get_google_maps_api_key()
    if not api_key:
        return url
    params = parse_qs(match.group(1), keep_blank_values=True)
    mode = params.pop("mode", ["place"])[0]
    # Flatten single-value lists from parse_qs
    flat_params = {k: v[0] for k, v in params.items()}
    qs = urlencode(flat_params)
    return f"https://www.google.com/maps/embed/v1/{mode}?key={api_key}&{qs}"


def _replace_proxy_urls(obj):
    """Recursively walk A2UI data and replace /maps/embed proxy URLs."""
    if isinstance(obj, str):
        return _proxy_url_to_full_embed_url(obj)
    if isinstance(obj, dict):
        return {k: _replace_proxy_urls(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_proxy_urls(item) for item in obj]
    return obj


def _split_combined_a2ui_data(data: dict) -> list[dict]:
    """Split one A2UI message containing multiple update types into separate messages.

    The LLM occasionally bundles createSurface + updateComponents +
    updateDataModel into a single object. Renderers reject this. Emit one
    message per update type, ordered so createSurface (and deleteSurface)
    run before updates that depend on the surface existing.
    """
    types_present = [t for t in _A2UI_UPDATE_TYPES if t in data]
    if len(types_present) <= 1:
        return [data]
    # Preserve the original `version` field only if the source had one.
    # v0.9 messages carry `"version": "v0.9"`; v0.8 messages have no
    # version field, so synthesizing one would fail v0.8 schema validation.
    base = {"version": data["version"]} if "version" in data else {}
    return [{**base, t: data[t]} for t in types_present]


def _repair_catalog_id(msg: dict, valid_catalog_id: str) -> None:
    """Overwrite a bad `createSurface.catalogId` with the session's active value.

    The LLM occasionally hallucinates IDs like ``"<agent_name>:<version>"``
    instead of copying the URL from the prompt example. Renderers reject
    those with ``Catalog not found`` and the surface never appears. v0.8
    ``beginRendering`` carries no catalogId so this is a v0.9-only repair.
    """
    create_surface = msg.get("createSurface")
    if not isinstance(create_surface, dict):
        return
    actual = create_surface.get("catalogId")
    if actual == valid_catalog_id:
        return
    logger.warning(
        "Repairing invalid createSurface.catalogId %r -> %r",
        actual,
        valid_catalog_id,
    )
    create_surface["catalogId"] = valid_catalog_id


def _process_a2ui_parts(parts: list, valid_catalog_id: str | None = None) -> list:
    """Split combined A2UI parts, rewrite /maps/embed proxy URLs, and repair catalogIds."""
    new_parts = []
    for part in parts:
        data_part = getattr(part, "root", None)
        is_a2ui = (
            isinstance(data_part, DataPart)
            and data_part.metadata
            and data_part.metadata.get("mimeType") == A2UI_MIME_TYPE
            and isinstance(data_part.data, dict)
        )
        if not is_a2ui:
            new_parts.append(part)
            continue
        for msg in _split_combined_a2ui_data(data_part.data):
            msg = _replace_proxy_urls(msg)
            if valid_catalog_id is not None:
                _repair_catalog_id(msg, valid_catalog_id)
            new_parts.append(create_a2ui_part(msg))
    return new_parts


# ---------------------------------------------------------------------------
# Thinking widget + progress bar
# ---------------------------------------------------------------------------

_STEP_MARKERS = {"done": "✓", "active": "▸", "pending": "○", "failed": "✗"}
_PROGRESS_CELLS = 20


def _progress_bar_text(pct: int, *, failed: bool = False) -> str:
    """Render a pure-text progress bar, e.g. ``██████░░░░░░░░░░  30%``."""
    pct = max(0, min(100, pct))
    filled = round(pct / 100 * _PROGRESS_CELLS)
    fill_char = "▓" if failed else "█"
    return f"{fill_char * filled}{'░' * (_PROGRESS_CELLS - filled)}  {pct}%"


_TOOL_MARKERS = {"pending": "○", "running": "•", "done": "✓", "failed": "✗"}
_INDENT = " " * 4  # noqa: RUF001 - NBSP is intentional

_TOOL_LABELS = {
    "find_restaurants": "Search for restaurants",
    "get_directions": "Get driving directions",
    "send_a2ui_json_to_client": "Render dashboard UI",
    "gws_call": "Access Google Workspace",
    "create_doc": "Create Google Doc",
    "append_doc_text": "Append text to Google Doc",
    "share_doc": "Share Google Doc",
    "share_anyone_with_link": "Share file with link",
    "create_sheet": "Create Google Sheet",
    "append_sheet_data": "Append data to Google Sheet",
    "read_doc": "Read Google Doc",
    "read_sheet": "Read Google Sheet",
    "read_presentation": "Read Google Presentation",
    "read_drive_file": "Read Google Drive file",
}

_TOOL_STEP_TITLES = {
    "find_restaurants": (
        "Searching for restaurants",
        "Calling Google Maps to find restaurants near the requested location.",
    ),
    "get_directions": (
        "Calculating driving directions",
        "Calling Google Maps to get routes between locations.",
    ),
    "send_a2ui_json_to_client": (
        "Compiling dashboard",
        "Generating the A2UI surface for your answer.",
    ),
    "gws_call": (
        "Accessing Google Workspace",
        "Executing Workspace API command.",
    ),
    "create_doc": (
        "Creating Google Doc",
        "Creating a new Google Document.",
    ),
    "append_doc_text": (
        "Appending text to Google Doc",
        "Adding content to the Google Document.",
    ),
    "share_doc": (
        "Sharing Google Doc",
        "Updating permissions on the Google Document.",
    ),
    "share_anyone_with_link": (
        "Sharing file with link",
        "Making file accessible to anyone with the link.",
    ),
    "create_sheet": (
        "Creating Google Sheet",
        "Creating a new Google Spreadsheet.",
    ),
    "append_sheet_data": (
        "Appending data to Google Sheet",
        "Adding rows to the Google Spreadsheet.",
    ),
    "read_doc": (
        "Reading Google Doc",
        "Fetching content from the Google Document.",
    ),
    "read_sheet": (
        "Reading Google Sheet",
        "Fetching rows from the Google Spreadsheet.",
    ),
    "read_presentation": (
        "Reading Google Presentation",
        "Fetching slides from the Google Presentation.",
    ),
    "read_drive_file": (
        "Reading Google Drive file",
        "Fetching content from the Google Drive file.",
    ),
}

PROGRESS_OPT_IN_KEY = "system:a2ui_progress"
PROGRESS_STAGE_META = "a2uiProgressStage"
PROGRESS_STEPS_META = "a2uiProgressSteps"
PROGRESS_SURFACE_PREFIX = "tool-progress-"


def _prettify_tool(name: str) -> str:
    """Map a tool name to a readable label."""
    if name in _TOOL_LABELS:
        return _TOOL_LABELS[name]
    pretty = name.removesuffix("_tool").replace("_", " ").strip()
    return pretty or name


def _tool_progress(steps: list[dict[str, Any]]) -> tuple[int, int, int]:
    """Return ``(done, total, pct)`` counting only tool calls across steps."""
    total = sum(len(s.get("tools", [])) for s in steps)
    done = sum(1 for s in steps for t in s.get("tools", []) if t.get("state") == "done")
    pct = round(done / total * 100) if total else 0
    return done, total, pct


def _public_progress_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return compact, UI-safe progress state for the frontend thinking panel."""
    public_steps: list[dict[str, Any]] = []
    for step in steps:
        tools = [
            {
                "label": _prettify_tool(tool.get("name", "")),
                "state": tool.get("state", "running"),
            }
            for tool in step.get("tools", [])
        ]
        public_steps.append(
            {
                "title": step.get("title", "Working"),
                "detail": step.get("detail"),
                "state": step.get("state", "pending"),
                "tools": tools,
                "completedTools": sum(1 for tool in tools if tool["state"] == "done"),
                "totalTools": len(tools),
            }
        )
    return public_steps


def _append_pending_dashboard_step(steps: list[dict[str, Any]]) -> None:
    """Show the dashboard step before the short render tool call starts."""
    if any(
        tool.get("name") == "send_a2ui_json_to_client"
        for step in steps
        for tool in step.get("tools", [])
    ):
        return
    title, detail = _TOOL_STEP_TITLES["send_a2ui_json_to_client"]
    steps.append(
        {
            "title": title,
            "detail": detail,
            "state": "pending",
            "call_key": None,
            "tools": [
                {
                    "name": "send_a2ui_json_to_client",
                    "id": None,
                    "state": "pending",
                }
            ],
        }
    )


def _tool_progress_messages(
    surface_id: str,
    steps: list[dict[str, Any]],
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
) -> list[dict[str, Any]]:
    """Build the A2UI "thinking" widget."""
    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )

    components: list[dict[str, Any]] = [
        {"id": "progress-root", "component": {"Card": {"child": "progress-col"}}},
    ]
    children: list[str] = ["th-title", "th-subtitle"]
    components.append(
        {
            "id": "th-title",
            "component": {
                "Text": {"text": {"literalString": "Thinking"}, "usageHint": "h3"}
            },
        }
    )
    components.append(
        {
            "id": "th-subtitle",
            "component": {
                "Text": {"text": {"literalString": subtitle}, "usageHint": "caption"}
            },
        }
    )

    for idx, step in enumerate(steps):
        step_children: list[str] = []

        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        step_id = f"th-step-{idx}"
        step_children.append(step_id)
        components.append(
            {
                "id": step_id,
                "component": {
                    "Text": {
                        "text": {"literalString": f"{marker} {step.get('title', '')}"},
                        "usageHint": "body",
                    }
                },
            }
        )
        detail = step.get("detail")
        if detail:
            detail_id = f"th-detail-{idx}"
            step_children.append(detail_id)
            components.append(
                {
                    "id": detail_id,
                    "component": {
                        "Text": {
                            "text": {"literalString": f"{_INDENT}{detail}"},
                            "usageHint": "caption",
                        }
                    },
                }
            )
        tools = step.get("tools", [])
        for jdx, tool in enumerate(tools):
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            tool_id = f"th-tool-{idx}-{jdx}"
            step_children.append(tool_id)
            components.append(
                {
                    "id": tool_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    f"{_INDENT}↳ {tmarker} "
                                    f"{_prettify_tool(tool.get('name', ''))}"
                                )
                            },
                            "usageHint": "caption",
                        }
                    },
                }
            )

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100) if tools else 0
            label_id = f"th-toolbar-label-{idx}"
            step_children.append(label_id)
            components.append(
                {
                    "id": label_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    f"{_INDENT}Tool calls · {step_done}/{len(tools)}"
                                )
                            },
                            "usageHint": "caption",
                        }
                    },
                }
            )
            bar_id = f"th-toolbar-{idx}"
            step_children.append(bar_id)
            components.append(
                {
                    "id": bar_id,
                    "component": {
                        "Text": {
                            "text": {
                                "literalString": (
                                    _INDENT
                                    + _progress_bar_text(step_pct, failed=step_failed)
                                )
                            },
                            "usageHint": "body",
                        }
                    },
                }
            )

        step_col_id = f"th-step-col-{idx}"
        step_card_id = f"th-step-card-{idx}"
        components.append(
            {
                "id": step_col_id,
                "component": {
                    "Column": {
                        "children": {"explicitList": step_children},
                        "alignment": "stretch",
                    }
                },
            }
        )
        components.append(
            {
                "id": step_card_id,
                "component": {"Card": {"child": step_col_id}},
            }
        )
        children.append(step_card_id)

    components.insert(
        1,
        {
            "id": "progress-col",
            "component": {
                "Column": {
                    "children": {"explicitList": children},
                    "alignment": "stretch",
                }
            },
        },
    )

    messages: list[dict[str, Any]] = []
    if include_begin:
        messages.append(
            {"beginRendering": {"surfaceId": surface_id, "root": "progress-root"}}
        )
    messages.append(
        {"surfaceUpdate": {"surfaceId": surface_id, "components": components}}
    )
    return messages


def _tool_progress_messages_v0_9(
    surface_id: str,
    steps: list[dict[str, Any]],
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
) -> list[dict[str, Any]]:
    """Build the A2UI v0.9 \"thinking\" widget."""
    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )

    components: list[dict[str, Any]] = [
        {"id": "progress-root", "component": "Card", "child": "progress-col"},
    ]
    children: list[str] = ["th-title", "th-subtitle"]
    components.append(
        {
            "id": "th-title",
            "component": "Text",
            "text": "Thinking",
            "variant": "h3",
        }
    )
    components.append(
        {
            "id": "th-subtitle",
            "component": "Text",
            "text": subtitle,
            "variant": "caption",
        }
    )

    for idx, step in enumerate(steps):
        step_children: list[str] = []

        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        step_id = f"th-step-{idx}"
        step_children.append(step_id)
        components.append(
            {
                "id": step_id,
                "component": "Text",
                "text": f"{marker} {step.get('title', '')}",
                "variant": "body",
            }
        )
        detail = step.get("detail")
        if detail:
            detail_id = f"th-detail-{idx}"
            step_children.append(detail_id)
            components.append(
                {
                    "id": detail_id,
                    "component": "Text",
                    "text": f"{_INDENT}{detail}",
                    "variant": "caption",
                }
            )
        tools = step.get("tools", [])
        for jdx, tool in enumerate(tools):
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            tool_id = f"th-tool-{idx}-{jdx}"
            step_children.append(tool_id)
            components.append(
                {
                    "id": tool_id,
                    "component": "Text",
                    "text": f"{_INDENT}↳ {tmarker} {_prettify_tool(tool.get('name', ''))}",
                    "variant": "caption",
                }
            )

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100) if tools else 0
            label_id = f"th-toolbar-label-{idx}"
            step_children.append(label_id)
            components.append(
                {
                    "id": label_id,
                    "component": "Text",
                    "text": f"{_INDENT}Tool calls · {step_done}/{len(tools)}",
                    "variant": "caption",
                }
            )
            bar_id = f"th-toolbar-{idx}"
            step_children.append(bar_id)
            components.append(
                {
                    "id": bar_id,
                    "component": "Text",
                    "text": _INDENT + _progress_bar_text(step_pct, failed=step_failed),
                    "variant": "body",
                }
            )

        step_col_id = f"th-step-col-{idx}"
        step_card_id = f"th-step-card-{idx}"
        components.append(
            {
                "id": step_col_id,
                "component": "Column",
                "children": step_children,
                "alignment": "stretch",
            }
        )
        components.append(
            {
                "id": step_card_id,
                "component": "Card",
                "child": step_col_id,
            }
        )
        children.append(step_card_id)

    components.insert(
        1,
        {
            "id": "progress-col",
            "component": "Column",
            "children": children,
            "alignment": "stretch",
        },
    )

    messages: list[dict[str, Any]] = []
    if include_begin:
        messages.append(
            {
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
                },
            }
        )
    messages.append(
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": surface_id,
                "components": components,
            },
        }
    )
    return messages


def _progress_status_text(
    steps: list[dict[str, Any]],
    fallback_text: str,
    *,
    done: bool = False,
    failed: bool = False,
) -> str:
    """Build the native text status shown by GE's thinking panel."""
    if not steps:
        return fallback_text

    active_title = next((s["title"] for s in steps if s.get("state") == "active"), None)
    subtitle = (
        "Failed" if failed else "Complete" if done else (active_title or "Working")
    )
    lines: list[str] = [subtitle, ""]

    for step in steps:
        marker = _STEP_MARKERS.get(step.get("state", "pending"), "○")
        lines.append(f"{marker} {step.get('title', '')}")

        detail = step.get("detail")
        if detail:
            lines.append(f"{_INDENT}{detail}")

        tools = step.get("tools", [])
        for tool in tools:
            tmarker = _TOOL_MARKERS.get(tool.get("state", "running"), "•")
            lines.append(f"{_INDENT}↳ {tmarker} {_prettify_tool(tool.get('name', ''))}")

        if tools:
            step_done = sum(1 for t in tools if t.get("state") == "done")
            step_failed = failed or any(t.get("state") == "failed" for t in tools)
            step_pct = round(step_done / len(tools) * 100)
            lines.append(f"{_INDENT}Tool calls · {step_done}/{len(tools)}")
            lines.append(f"{_INDENT}{_progress_bar_text(step_pct, failed=step_failed)}")

        lines.append("")

    return "\n".join(lines).rstrip()


def _has_function_call(event) -> bool:
    """Check if the event contains any function calls."""
    content = getattr(event, "content", None)
    parts = getattr(content, "parts", None) or []
    for part in parts:
        fc = getattr(part, "function_call", None)
        if fc and getattr(fc, "name", None):
            return True
    return False


def _get_single_line_progress(
    steps: list[dict[str, Any]],
    *,
    done: bool = False,
    failed: bool = False,
) -> tuple[str | None, int]:
    """Calculate progress percentage and build single-line progress text for GE."""
    if failed:
        return "✗ Failed", 0
    if done:
        return "✓ Complete (100%)", 100
    if not steps:
        return None, 0

    active_step = next((s for s in steps if s.get("state") == "active"), None)
    if not active_step:
        active_step = steps[-1] if steps else None

    if not active_step:
        return "Thinking... (5%)", 5

    title = active_step.get("title", "Thinking")

    # Calculate tool-based progress if tools exist
    done_tools = sum(
        1 for s in steps for t in s.get("tools", []) if t.get("state") == "done"
    )
    total_tools = sum(len(s.get("tools", [])) for s in steps)

    if total_tools > 0:
        pct = round(done_tools / total_tools * 100)
    else:
        # If no tools, distribute progress evenly across steps
        total_steps = len(steps)
        active_idx = steps.index(active_step) if active_step in steps else 0
        pct = round((active_idx + 0.5) / total_steps * 100) if total_steps else 0

    pct = max(5, min(95, pct))
    return f"▸ {title}... ({pct}%)", pct


def _get_estimated_single_line_progress(
    steps: list[dict[str, Any]],
    *,
    now: float | None = None,
) -> tuple[str | None, int]:
    """Build an estimated native progress line while the active tool is running."""
    if not steps:
        return None, 0
    active_step = next((s for s in steps if s.get("state") == "active"), None)
    if not active_step:
        return _get_single_line_progress(steps)

    title = active_step.get("title", "Thinking")
    done_tools = sum(
        1 for s in steps for t in s.get("tools", []) if t.get("state") == "done"
    )
    total_tools = sum(len(s.get("tools", [])) for s in steps)
    if total_tools <= 0:
        return _get_single_line_progress(steps)

    active_started_at = active_step.get("active_started_at")
    if not isinstance(active_started_at, (int, float)):
        return _get_single_line_progress(steps)

    current = now if now is not None else time.monotonic()
    elapsed_secs = max(0.0, current - active_started_at)
    title_lower = str(title).lower()
    if "searching for restaurants" in title_lower:
        estimated_secs = 32.0
    elif "compiling dashboard" in title_lower:
        estimated_secs = 3.0
    else:
        estimated_secs = 20.0

    phase_start = done_tools / total_tools * 100
    phase_end = min(95.0, (done_tools + 1) / total_tools * 100)
    elapsed_ratio = min(1.0, elapsed_secs / estimated_secs)
    pct = round(phase_start + (phase_end - phase_start) * elapsed_ratio)
    milestones = [5, 25, 40, 60, 75, 90, 95]
    phase_milestones = [
        milestone
        for milestone in milestones
        if phase_start < milestone < phase_end and milestone <= pct
    ]
    if phase_milestones:
        pct = max(phase_milestones)
    else:
        pct = round(phase_start)
    pct = max(5, min(95, pct))
    return f"▸ {title}... ({pct}%)", pct


def _native_replay_tool_pcts(count: int) -> list[int]:
    """Return final replay milestones for completed tool-backed steps."""
    if count <= 0:
        return []
    if count == 1:
        return [70]
    if count == 2:
        # The common restaurant flow becomes 5 -> 40 -> 70 -> 90 -> 100.
        return [40, 70]

    start = 40
    end = 80
    return [
        round(start + ((end - start) * idx / max(1, count - 1))) for idx in range(count)
    ]


def _replace_progress_pct(text: str, pct: int) -> str:
    """Replace the first percentage marker in a native progress line."""
    return re.sub(r"\(\d+%\)", f"({pct}%)", text, count=1)


def _native_tool_step_text(step: dict[str, Any], pct: int) -> str:
    """Build one GE-friendly replay snapshot with tool call detail."""
    marker = _STEP_MARKERS.get(step.get("state", "done"), "✓")
    title = step.get("title", "Working")
    lines = [f"{marker} {title}... ({pct}%)"]

    tools = step.get("tools", [])
    for tool in tools:
        tmarker = _TOOL_MARKERS.get(tool.get("state", "done"), "✓")
        lines.append(f"{_INDENT}↳ {tmarker} {_prettify_tool(tool.get('name', ''))}")

    if tools:
        done = sum(1 for tool in tools if tool.get("state") == "done")
        lines.append(f"{_INDENT}Tool calls · {done}/{len(tools)}")

    return "\n".join(lines)


def _normalize_native_replay_pcts(
    replay: list[tuple[str, int]], *, last_pct: int
) -> list[tuple[str, int]]:
    """Keep final replay percentages monotonic without dropping stage text."""
    if not replay:
        return replay

    normalized: list[tuple[str, int]] = []
    current = max(0, min(99, last_pct))
    non_complete_count = max(0, len(replay) - 1)
    for idx, (text, pct) in enumerate(replay):
        is_complete = idx == len(replay) - 1
        if is_complete:
            normalized.append((_replace_progress_pct(text, 100), 100))
            continue

        remaining_non_complete = non_complete_count - idx - 1
        max_for_slot = 99 - remaining_non_complete
        bump = (
            1
            if pct <= current
            and current >= NativeProgressTracker._UNDERSTANDING_CEIL_PCT
            else 0
        )
        pct = max(pct, current + bump)
        pct = min(max_for_slot, max(5, min(99, pct)))
        current = pct
        normalized.append((_replace_progress_pct(text, pct), pct))

    return normalized


def _build_native_final_replay(
    steps: list[dict[str, Any]],
    *,
    last_pct: int = 0,
    skip_tool_count: int = 0,
) -> list[tuple[str, int]]:
    """Build GE Thinking snapshots to replay if the real task finished quickly."""
    all_tool_steps = [
        step
        for step in steps
        if step.get("title")
        and str(step.get("title")).lower() != "understanding request"
    ]
    tool_steps = all_tool_steps[max(0, skip_tool_count) :]

    replay: list[tuple[str, int]] = []
    if not all_tool_steps or (
        skip_tool_count <= 0
        and last_pct < NativeProgressTracker._UNDERSTANDING_CEIL_PCT
    ):
        replay.append(("▸ Understanding request... (5%)", 5))

    replay_pcts = _native_replay_tool_pcts(len(all_tool_steps))[skip_tool_count:]
    for step, pct in zip(tool_steps, replay_pcts, strict=True):
        replay.append((_native_tool_step_text(step, pct), pct))

    if not all_tool_steps:
        replay.append(("▸ Preparing response... (70%)", 70))

    replay.extend(
        [
            ("▸ Composing response... (90%)", 90),
            ("✓ Complete (100%)", 100),
        ]
    )

    deduped: list[tuple[str, int]] = []
    seen_text: set[str] = set()
    for text, pct in replay:
        if text in seen_text:
            continue
        seen_text.add(text)
        deduped.append((text, pct))
    return _normalize_native_replay_pcts(deduped, last_pct=last_pct)


def _progress_status_parts(
    surface_id: str,
    steps: list[dict[str, Any]],
    stage_text: str,
    *,
    include_begin: bool = False,
    done: bool = False,
    failed: bool = False,
    include_a2ui: bool = True,
    ui_version: str = VERSION_0_8,
) -> list:
    """Build the parts for one progress status update."""
    text = (
        stage_text
        if include_a2ui
        else _progress_status_text(steps, stage_text, done=done, failed=failed)
    )
    parts: list = [Part(root=TextPart(text=text))]
    if include_a2ui:
        if ui_version == VERSION_0_9:
            msgs = _tool_progress_messages_v0_9(
                surface_id,
                steps,
                include_begin=include_begin,
                done=done,
                failed=failed,
            )
        else:
            msgs = _tool_progress_messages(
                surface_id,
                steps,
                include_begin=include_begin,
                done=done,
                failed=failed,
            )
        parts.extend(create_a2ui_part(msg) for msg in msgs)
    return parts


def _iter_part_owners(a2a_event):
    """Yield objects on an A2A event that own a mutable ``parts`` list."""
    owners = []
    message = getattr(getattr(a2a_event, "status", None), "message", None)
    if message is not None:
        owners.append(message)
    artifact = getattr(a2a_event, "artifact", None)
    if artifact is not None:
        owners.append(artifact)
    owners.extend(getattr(a2a_event, "artifacts", None) or [])

    seen: set[int] = set()
    for owner in owners:
        if id(owner) in seen:
            continue
        seen.add(id(owner))
        yield owner


def _generated_text_signature(text: str) -> str | None:
    """Return a stable signature for generated answer text we should not repeat."""
    normalized = text.strip()
    if not normalized:
        return None
    return re.sub(r"\s+", " ", normalized).lower()


def _dedupe_text_parts_across_events(a2a_events, seen: set[str] | None = None) -> None:
    """Remove repeated answer text when ADK/A2A emits it in multiple containers."""
    if seen is None:
        seen = set()

    def clean_parts(parts: list) -> list:
        cleaned_parts = []
        for part in parts:
            root = getattr(part, "root", None)
            if isinstance(root, TextPart):
                text = root.text
                signature = _generated_text_signature(text)
                if signature:
                    if signature in seen:
                        continue
                    seen.add(signature)
            cleaned_parts.append(part)
        return cleaned_parts

    for a2a_event in a2a_events:
        for owner in _iter_part_owners(a2a_event):
            if getattr(owner, "parts", None):
                owner.parts = clean_parts(owner.parts)


class NativeProgressTracker:
    """Task-keyed progress state for Gemini Enterprise's poll-driven Thinking tab.

    GE uses ``message/send`` + ``tasks/get`` polling (the agent card advertises
    ``streaming=False``). On each poll, while the task is not ``completed``, GE
    renders ``task.status.message``; once ``completed`` it renders
    ``task.artifacts``. It does NOT accumulate ``task.history`` — it shows the
    current snapshot.

    Our agent frequently finishes within a single GE poll interval, so the
    stream of ``working`` status events collapses: by the first poll the stored
    ``status.message`` has already raced to ``"✓ Complete (100%)"`` (or the task
    is already ``completed``). The result is a Thinking tab that only ever shows
    ``100%``.

    This tracker decouples the displayed stage from event timing. The custom
    ``tasks/get`` handler (:class:`ProgressAwareRequestHandler`) computes the
    *current* stage from this state at read time, so every poll — whenever it
    lands — returns an accurate, time-advanced progress line. Responsiveness is
    still bounded by GE's poll interval (polling is inherently less dynamic than
    streaming), but each poll is now correct.
    """

    # Pre-tool "Understanding request" phase advances 5% -> this ceiling on a
    # gentle elapsed-time curve, so an early poll never shows a misleading 100%.
    _UNDERSTANDING_CEIL_PCT = 30

    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}

    def start(self, task_id: str) -> None:
        """Begin tracking a task in the ``working`` state."""
        self._tasks[task_id] = {
            "started_at": time.monotonic(),
            "steps": [],
            "state": "working",
            "last_pct": 5,
            "done_replay_index": 0,
            "done_replay_served_count": 0,
        }

    def attach_steps(self, task_id: str, steps: list[dict[str, Any]]) -> None:
        """Point this task at the converter's live step list (by reference)."""
        entry = self._tasks.get(task_id)
        if entry is not None:
            entry["steps"] = steps

    def finalize(self, task_id: str) -> None:
        """Replay final milestones while the task remains ``working``."""
        entry = self._tasks.get(task_id)
        if entry is not None:
            entry["state"] = "finalizing"
            entry["finalized_at"] = time.monotonic()
            entry["replay"] = _build_native_final_replay(
                entry.get("steps") or [],
                last_pct=entry.get("last_pct", 0),
                skip_tool_count=entry.get("done_replay_served_count", 0),
            )
            entry["replay_index"] = None
            entry["complete_served_at"] = None

    def final_replay_complete(self, task_id: str) -> bool:
        """Return True once a poll has received the final 100% snapshot."""
        entry = self._tasks.get(task_id)
        return bool(entry and entry.get("complete_served_at") is not None)

    def finish(self, task_id: str, *, failed: bool = False) -> None:
        """Stop tracking so polls fall back to the stored task/artifacts."""
        self._tasks.pop(task_id, None)
        if failed:
            # Nothing to retain; a failed task surfaces its error via the store.
            return

    def status_message(
        self, task_id: str, *, now: float | None = None
    ) -> Message | None:
        """Compute the current ``working`` status message for a poll, or None."""
        entry = self._tasks.get(task_id)
        if not entry:
            return None
        if entry["state"] == "finalizing":
            current = now if now is not None else time.monotonic()
            replay = entry.get("replay") or [("✓ Complete (100%)", 100)]
            replay_index = entry.get("replay_index")
            if replay_index is None:
                replay_index = 0
            elif replay_index < len(replay) - 1:
                replay_index += 1
            entry["replay_index"] = replay_index

            text, pct = replay[replay_index]
            entry["last_pct"] = pct
            if pct >= 100:
                entry["complete_served_at"] = current
            return Message(
                message_id=uuid.uuid4().hex,
                role=Role.agent,
                parts=[Part(root=TextPart(text=text))],
            )
        if entry["state"] != "working":
            return None

        steps = entry.get("steps") or []
        if steps:
            active_step = next(
                (step for step in steps if step.get("state") == "active"),
                None,
            )
            tool_steps = [
                step
                for step in steps
                if step.get("title")
                and str(step.get("title")).lower() != "understanding request"
            ]
            all_tool_steps_done = bool(tool_steps) and all(
                step.get("state") in ("done", "failed") for step in tool_steps
            )
            if active_step is None and all_tool_steps_done:
                idx = min(
                    entry.get("done_replay_index", 0),
                    max(0, len(tool_steps) - 1),
                )
                replay_pcts = _native_replay_tool_pcts(len(tool_steps))
                text = _native_tool_step_text(tool_steps[idx], replay_pcts[idx])
                pct = replay_pcts[idx]
                entry["done_replay_index"] = min(idx + 1, len(tool_steps))
                entry["done_replay_served_count"] = max(
                    entry.get("done_replay_served_count", 0),
                    idx + 1,
                )
            else:
                text, pct = _get_estimated_single_line_progress(steps, now=now)
        else:
            current = now if now is not None else time.monotonic()
            elapsed = max(0.0, current - entry["started_at"])
            pct = min(self._UNDERSTANDING_CEIL_PCT, 5 + int(elapsed * 5))
            text = f"▸ Understanding request... ({pct}%)"

        if not text:
            return None

        # Monotonic: a snapshot must never regress between polls.
        last = entry.get("last_pct", 0)
        if pct < last:
            pct = last
            text = _replace_progress_pct(text, pct)
        entry["last_pct"] = pct

        return Message(
            message_id=uuid.uuid4().hex,
            role=Role.agent,
            parts=[Part(root=TextPart(text=text))],
        )


class _MapsKeyEventConverter(A2uiEventConverter):
    """Post-processes A2A events to keep A2UI parts well-formed and enrichment with progress."""

    def __init__(self, native_progress: NativeProgressTracker | None = None):
        super().__init__()
        self._progress: dict[str, dict[str, Any]] = {}
        self._seen_text_signatures: dict[str, set[str]] = {}
        self._native_progress = native_progress

    def _advance_steps(self, event, steps: list[dict[str, Any]]) -> str | None:
        """Update ``steps`` in place from one ADK event."""
        content = getattr(event, "content", None)
        parts = getattr(content, "parts", None) or []

        function_calls: list[dict[str, str | None]] = []
        function_responses: list[dict[str, str | None]] = []
        has_text = False
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None):
                function_calls.append({"name": fc.name, "id": getattr(fc, "id", None)})
            fr = getattr(part, "function_response", None)
            if fr and getattr(fr, "name", None):
                function_responses.append(
                    {"name": fr.name, "id": getattr(fr, "id", None)}
                )
            if getattr(part, "text", None):
                has_text = True

        stage: str | None = None

        if function_responses:
            response_ids = {r["id"] for r in function_responses if r.get("id")}
            response_names = {r["name"] for r in function_responses}
            for step in steps:
                for tool in step.get("tools", []):
                    if tool["state"] == "running" and (
                        (tool.get("id") and tool.get("id") in response_ids)
                        or (
                            tool.get("id")
                            and not response_ids
                            and tool["name"] in response_names
                        )
                        or (not tool.get("id") and tool["name"] in response_names)
                    ):
                        tool["state"] = "done"
            for step in steps:
                tools = step.get("tools", [])
                if (
                    tools
                    and step["state"] == "active"
                    and all(t["state"] != "running" for t in tools)
                ):
                    step["state"] = "done"
            names = ", ".join(_prettify_tool(r["name"]) for r in function_responses)
            stage = f"Processing results\nIntegrated output from {names}."

        if function_calls:
            call_key = tuple(c.get("id") or f"name:{c['name']}" for c in function_calls)
            if any(step.get("call_key") == call_key for step in steps):
                return stage

            existing_step = next(
                (
                    s
                    for s in steps
                    if any(
                        t["name"] == function_calls[0]["name"]
                        for t in s.get("tools", [])
                    )
                ),
                None,
            )
            if existing_step:
                existing_step["state"] = "active"
                existing_step["call_key"] = call_key
                existing_step["active_started_at"] = time.monotonic()
                existing_step["tools"] = [
                    {
                        "name": c["name"],
                        "id": c.get("id"),
                        "state": "running",
                    }
                    for c in function_calls
                ]
                stage = f"{existing_step['title']}...\n{existing_step['detail']}"
                return stage

            for step in steps:
                if step["state"] == "active":
                    step["state"] = "done"
            title, detail = _TOOL_STEP_TITLES.get(
                function_calls[0]["name"],
                (
                    f"Calling {_prettify_tool(function_calls[0]['name'])}",
                    "Running tool.",
                ),
            )
            steps.append(
                {
                    "title": title,
                    "detail": detail,
                    "state": "active",
                    "call_key": call_key,
                    "active_started_at": time.monotonic(),
                    "tools": [
                        {
                            "name": c["name"],
                            "id": c.get("id"),
                            "state": "running",
                        }
                        for c in function_calls
                    ],
                }
            )
            if function_calls[0]["name"] == "find_restaurants":
                _append_pending_dashboard_step(steps)
            stage = f"{title}...\n{detail}"

        if (
            has_text
            and not function_calls
            and not function_responses
            and event.is_final_response()
        ):
            for step in steps:
                if step["state"] == "active":
                    step["state"] = "done"
                for tool in step.get("tools", []):
                    if tool["state"] == "running":
                        tool["state"] = "done"
            if steps:
                stage = "Composing response\nFinalizing the answer."

        return stage

    def _enrich_with_progress(
        self, event, invocation_context, a2a_events, task_id, context_id
    ) -> None:
        """Surface the thinking steps + per-step progress bar."""
        opt_in = bool(invocation_context.session.state.get(PROGRESS_OPT_IN_KEY))

        inv_id = getattr(invocation_context, "invocation_id", "") or "default"
        progress = self._progress.setdefault(
            inv_id,
            {
                "steps": [],
                "surface_id": f"{PROGRESS_SURFACE_PREFIX}{uuid.uuid4().hex[:8]}",
                "begin_sent": False,
                "last_native_pct": 0,
                "last_emitted_text": None,
            },
        )

        steps = progress["steps"]
        is_final = bool(
            getattr(event, "is_final_response", None)
            and event.is_final_response()
            and not _has_function_call(event)
        )
        failed = any(
            getattr(getattr(e, "status", None), "state", None) == TaskState.failed
            for e in a2a_events
        )
        if failed:
            for step in steps:
                if step["state"] == "active":
                    step["state"] = "failed"
                for tool in step.get("tools", []):
                    if tool["state"] == "running":
                        tool["state"] = "failed"

        stage: str | None = None
        if opt_in and not steps and not is_final:
            steps.append(
                {
                    "title": "Understanding request",
                    "detail": "Analyzing your message and choosing the next action.",
                    "state": "active",
                    "call_key": None,
                    "tools": [],
                }
            )
            stage = (
                "Understanding request...\n"
                "Analyzing your message and choosing the next action."
            )

        advanced_stage = self._advance_steps(event, steps)
        if advanced_stage:
            stage = advanced_stage
        all_done = bool(steps) and all(s["state"] in ("done", "failed") for s in steps)

        if opt_in and stage and steps:
            progress["begin_sent"] = True
            extra_parts = [
                Part(
                    root=TextPart(
                        text=stage,
                        metadata={
                            PROGRESS_STAGE_META: True,
                            PROGRESS_STEPS_META: _public_progress_steps(steps),
                        },
                    )
                )
            ]
            for a2a_event in a2a_events:
                status = getattr(a2a_event, "status", None)
                msg = getattr(status, "message", None)
                if (
                    status is not None
                    and getattr(status, "state", None) == TaskState.working
                    and msg is not None
                ):
                    msg.parts = (msg.parts or []) + extra_parts
                    extra_parts = []
                    break
            if extra_parts:
                a2a_events.insert(
                    0,
                    TaskStatusUpdateEvent(
                        task_id=task_id,
                        context_id=context_id,
                        final=False,
                        status=TaskStatus(
                            state=TaskState.working,
                            message=Message(
                                message_id=uuid.uuid4().hex,
                                role=Role.agent,
                                parts=extra_parts,
                            ),
                        ),
                    ),
                )
        elif not opt_in:
            # Share the live step list with the poll-driven get_task handler so
            # it can compute the current GE Thinking-tab stage at read time.
            if self._native_progress is not None:
                self._native_progress.attach_steps(task_id, steps)

            all_done = bool(steps) and all(
                s["state"] in ("done", "failed") for s in steps
            )

            native_updates: list[tuple[str | None, int]] = []
            if is_final and failed:
                native_updates.append(_get_single_line_progress(steps, failed=True))
            elif is_final and not all_done and steps:
                # Preserve the last in-flight transition before the final
                # completion event. ADK can coalesce a tool response and final
                # text into the same event; without this, GE jumps from the
                # previous status directly to 100%.
                native_updates.append(_get_single_line_progress(steps, failed=failed))
            elif not is_final:
                native_updates.append(
                    _get_single_line_progress(steps, done=all_done, failed=failed)
                )

            insert_at = 0
            force_separate_progress_events = len(native_updates) > 1
            for text, pct in native_updates:
                if not text:
                    continue
                last_pct = progress.get("last_native_pct", 0)
                last_text = progress.get("last_emitted_text")

                # Enforce monotonicity
                if pct < last_pct:
                    pct = last_pct
                    if text.startswith("▸ ") and " (" in text:
                        prefix = text.split(" (")[0]
                        text = f"{prefix} ({pct}%)"

                progress["last_native_pct"] = pct

                # Enforce deduplication
                if text != last_text:
                    progress["last_emitted_text"] = text

                    extra_parts = [Part(root=TextPart(text=text))]

                    if not force_separate_progress_events:
                        for a2a_event in a2a_events:
                            status = getattr(a2a_event, "status", None)
                            msg = getattr(status, "message", None)
                            if (
                                status is not None
                                and getattr(status, "state", None) == TaskState.working
                                and msg is not None
                            ):
                                msg.parts = (msg.parts or []) + extra_parts
                                extra_parts = []
                                break
                    if extra_parts:
                        a2a_events.insert(
                            insert_at,
                            TaskStatusUpdateEvent(
                                task_id=task_id,
                                context_id=context_id,
                                final=False,
                                status=TaskStatus(
                                    state=TaskState.working,
                                    message=Message(
                                        message_id=uuid.uuid4().hex,
                                        role=Role.agent,
                                        parts=extra_parts,
                                    ),
                                ),
                            ),
                        )
                        insert_at += 1

        # Final progress state is cleaned up by the executor after GE/native
        # polling replay has had a chance to expose task.status.message.

    def native_progress_heartbeat(
        self,
        invocation_id: str,
        task_id: str,
        context_id: str,
    ) -> TaskStatusUpdateEvent | None:
        """Create a native text progress heartbeat for append-only GE polling."""
        progress = self._progress.get(invocation_id)
        if not progress:
            return None
        steps = progress.get("steps") or []
        if not any(step.get("state") == "active" for step in steps):
            return None

        text, pct = _get_estimated_single_line_progress(steps)
        if not text:
            return None

        last_pct = progress.get("last_native_pct", 0)
        last_text = progress.get("last_emitted_text")
        if pct < last_pct:
            pct = last_pct
            if text.startswith("▸ ") and " (" in text:
                prefix = text.split(" (")[0]
                text = f"{prefix} ({pct}%)"

        if text == last_text:
            return None

        progress["last_native_pct"] = pct
        progress["last_emitted_text"] = text
        return TaskStatusUpdateEvent(
            task_id=task_id,
            context_id=context_id,
            final=False,
            status=TaskStatus(
                state=TaskState.working,
                message=Message(
                    message_id=uuid.uuid4().hex,
                    role=Role.agent,
                    parts=[Part(root=TextPart(text=text))],
                ),
            ),
        )

    def __call__(
        self,
        event,
        invocation_context,
        task_id=None,
        context_id=None,
        part_converter_func=None,
    ):
        kwargs = {
            "event": event,
            "invocation_context": invocation_context,
            "task_id": task_id,
            "context_id": context_id,
        }
        if part_converter_func is not None:
            kwargs["part_converter_func"] = part_converter_func
        a2a_events = super().__call__(**kwargs)

        catalog = invocation_context.session.state.get(A2UI_CATALOG_KEY)
        valid_catalog_id = getattr(catalog, "catalog_id", None)

        for a2a_event in a2a_events:
            message = getattr(getattr(a2a_event, "status", None), "message", None)
            if message and message.parts:
                message.parts = _process_a2ui_parts(message.parts, valid_catalog_id)
            for artifact in getattr(a2a_event, "artifacts", None) or []:
                if artifact.parts:
                    artifact.parts = _process_a2ui_parts(
                        artifact.parts, valid_catalog_id
                    )

        inv_id = getattr(invocation_context, "invocation_id", "") or "default"
        seen_text = self._seen_text_signatures.setdefault(inv_id, set())
        _dedupe_text_parts_across_events(a2a_events, seen_text)

        self._enrich_with_progress(
            event, invocation_context, a2a_events, task_id, context_id
        )

        if getattr(event, "is_final_response", None) and event.is_final_response():
            self._seen_text_signatures.pop(inv_id, None)

        return a2a_events


class RestaurantFinderExecutor(A2aAgentExecutor):
    """Executor for the Restaurant Finder agent with A2UI GE session setup."""

    def __init__(self, base_url: str, agent: RestaurantFinderAgent):
        self._base_url = base_url
        self._agent = agent

        # Shared with ProgressAwareRequestHandler so the poll-driven tasks/get
        # endpoint can render the current GE Thinking-tab stage at read time.
        self.native_progress = NativeProgressTracker()

        config = A2aAgentExecutorConfig(
            event_converter=_MapsKeyEventConverter(self.native_progress)
        )
        # `use_legacy=True` forces ADK's legacy execute() path, which calls
        # the overridden `_prepare_session` below. The newer ADK impl
        # (`_A2aAgentExecutor` in `a2a_agent_executor_impl.py`) is opted
        # into by clients that send the `_NEW_A2A_ADK_INTEGRATION_EXTENSION`
        # extension (Gemini Enterprise does this), and that path bypasses
        # `_prepare_session` entirely — so our A2UI session state never gets
        # set and `send_a2ui_json_to_client` is missing from the toolset.
        super().__init__(
            runner=self._agent.get_runner(),
            config=config,
            use_legacy=True,
        )

    async def _native_progress_heartbeat_loop(
        self,
        *,
        event_queue: EventQueue,
        invocation_id: str,
        task_id: str,
        context_id: str,
        stop_event: asyncio.Event,
    ) -> None:
        converter = self._config.event_converter
        if not isinstance(converter, _MapsKeyEventConverter):
            return
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(
                    stop_event.wait(),
                    timeout=NATIVE_PROGRESS_HEARTBEAT_INTERVAL_SECS,
                )
            except asyncio.TimeoutError:
                heartbeat = converter.native_progress_heartbeat(
                    invocation_id,
                    task_id,
                    context_id,
                )
                if heartbeat is not None:
                    await event_queue.enqueue_event(heartbeat)

    @override
    async def _handle_request(
        self,
        context: RequestContext,
        event_queue: EventQueue,
    ):
        runner = await self._resolve_runner()

        run_request = self._config.request_converter(
            context,
            self._config.a2a_part_converter,
        )

        session = await self._prepare_session(context, run_request, runner)

        invocation_context = runner._new_invocation_context(
            session=session,
            new_message=run_request.new_message,
            run_config=run_request.run_config,
        )

        executor_context = ExecutorContext(
            app_name=runner.app_name,
            user_id=run_request.user_id,
            session_id=run_request.session_id,
            runner=runner,
        )

        await event_queue.enqueue_event(
            TaskStatusUpdateEvent(
                task_id=context.task_id,
                status=TaskStatus(
                    state=TaskState.working,
                    timestamp=datetime.fromtimestamp(
                        platform_time.get_time(), tz=timezone.utc
                    ).isoformat(),
                    message=(
                        None
                        if session.state.get(PROGRESS_OPT_IN_KEY)
                        else Message(
                            message_id=uuid.uuid4().hex,
                            role=Role.agent,
                            parts=[
                                Part(
                                    root=TextPart(
                                        text="▸ Understanding request... (5%)"
                                    )
                                )
                            ],
                        )
                    ),
                ),
                context_id=context.context_id,
                final=False,
                metadata={
                    _get_adk_metadata_key("app_name"): runner.app_name,
                    _get_adk_metadata_key("user_id"): run_request.user_id,
                    _get_adk_metadata_key("session_id"): run_request.session_id,
                },
            )
        )

        native_progress = not session.state.get(PROGRESS_OPT_IN_KEY)
        stop_heartbeat = asyncio.Event()
        heartbeat_task: asyncio.Task | None = None
        if native_progress:
            self.native_progress.start(context.task_id)
            heartbeat_task = asyncio.create_task(
                self._native_progress_heartbeat_loop(
                    event_queue=event_queue,
                    invocation_id=invocation_context.invocation_id,
                    task_id=context.task_id,
                    context_id=context.context_id,
                    stop_event=stop_heartbeat,
                )
            )

        task_result_aggregator = TaskResultAggregator()
        try:
            async with Aclosing(runner.run_async(**vars(run_request))) as agen:
                async for adk_event in agen:
                    for a2a_event in self._config.event_converter(
                        adk_event,
                        invocation_context,
                        context.task_id,
                        context.context_id,
                        self._config.gen_ai_part_converter,
                    ):
                        a2a_events = await execute_after_event_interceptors(
                            a2a_event,
                            executor_context,
                            adk_event,
                            self._config.execute_interceptors,
                        )
                        for e in a2a_events:
                            task_result_aggregator.process_event(e)
                            await event_queue.enqueue_event(e)
        except BaseException:
            if native_progress:
                self.native_progress.finish(context.task_id, failed=True)
            raise
        finally:
            stop_heartbeat.set()
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                try:
                    await heartbeat_task
                except asyncio.CancelledError:
                    pass

        if native_progress:
            # Work is done; keep the task in ``working`` briefly so GE polling
            # can append the staged Thinking snapshots before artifacts replace
            # the Thinking tab.
            self.native_progress.finalize(context.task_id)
            replay_deadline = time.monotonic() + NATIVE_PROGRESS_FINAL_HOLD_SECS
            while (
                time.monotonic() < replay_deadline
                and not self.native_progress.final_replay_complete(context.task_id)
            ):
                await asyncio.sleep(NATIVE_PROGRESS_REPLAY_CHECK_SECS)
            self.native_progress.finish(context.task_id)

        if (
            task_result_aggregator.task_state == TaskState.working
            and task_result_aggregator.task_status_message is not None
            and task_result_aggregator.task_status_message.parts
        ):
            await event_queue.enqueue_event(
                TaskArtifactUpdateEvent(
                    task_id=context.task_id,
                    last_chunk=True,
                    context_id=context.context_id,
                    artifact=Artifact(
                        artifact_id=platform_uuid.new_uuid(),
                        parts=task_result_aggregator.task_status_message.parts,
                    ),
                )
            )
            final_event = TaskStatusUpdateEvent(
                task_id=context.task_id,
                status=TaskStatus(
                    state=TaskState.completed,
                    timestamp=datetime.fromtimestamp(
                        platform_time.get_time(), tz=timezone.utc
                    ).isoformat(),
                ),
                context_id=context.context_id,
                final=True,
            )
        else:
            final_event = TaskStatusUpdateEvent(
                task_id=context.task_id,
                status=TaskStatus(
                    state=task_result_aggregator.task_state,
                    timestamp=datetime.fromtimestamp(
                        platform_time.get_time(), tz=timezone.utc
                    ).isoformat(),
                    message=task_result_aggregator.task_status_message,
                ),
                context_id=context.context_id,
                final=True,
            )

        final_event = await execute_after_agent_interceptors(
            executor_context,
            final_event,
            self._config.execute_interceptors,
        )
        await event_queue.enqueue_event(final_event)

    @override
    async def _prepare_session(
        self,
        context: RequestContext,
        run_request: AgentRunRequest,
        runner: Runner,
    ):
        logger.info("Loading session for message %s", context.message)

        active_ui_version = try_activate_a2ui_extension(context, self._agent.agent_card)

        # The agent supports both A2UI v0.8 (Gemini Enterprise) and v0.9
        # (custom Lit shell). When the client omits the X-A2A-Extensions
        # header the toolset would otherwise stay disabled and the LLM
        # would hallucinate `send_a2ui_json_to_client` from its system
        # prompt. Gemini Enterprise sends no A2UI header but only renders
        # v0.8, so default to v0.8. The Lit shell explicitly sends the
        # v0.9 extension header and is unaffected.
        if not active_ui_version:
            active_ui_version = VERSION_0_8
            try:
                context.add_activated_extension(A2UI_EXTENSION_URI_V0_8)
            except Exception:
                logger.debug("Could not register fallback A2UI extension on context")

        schema_manager = self._agent.get_schema_manager(active_ui_version)

        session = await super()._prepare_session(context, run_request, runner)

        if "base_url" not in session.state:
            session.state["base_url"] = self._base_url

        if active_ui_version:
            session.state["active_ui_version"] = active_ui_version

        session.state[PROGRESS_OPT_IN_KEY] = bool(
            (context.message.metadata or {}).get("a2uiProgress")
            if context.message
            else False
        )

        if active_ui_version and schema_manager:
            capabilities = (
                context.message.metadata.get(A2UI_CLIENT_CAPABILITIES_KEY)
                if context.message and context.message.metadata
                else None
            )
            a2ui_catalog = schema_manager.get_selected_catalog(
                client_ui_capabilities=capabilities
            )
            examples = schema_manager.load_examples(a2ui_catalog, validate=True)

            await runner.session_service.append_event(
                session,
                Event(
                    invocation_id=new_invocation_context_id(),
                    author="system",
                    actions=EventActions(
                        state_delta={
                            A2UI_ENABLED_KEY: True,
                            A2UI_CATALOG_KEY: a2ui_catalog,
                            A2UI_EXAMPLES_KEY: examples,
                        }
                    ),
                ),
            )

        return session


class ProgressAwareRequestHandler(DefaultRequestHandler):
    """Request handler that renders live progress for GE's poll-driven Thinking tab.

    Gemini Enterprise polls ``tasks/get`` and displays ``task.status.message``
    while the task is not ``completed``. Because our agent often finishes within
    one poll interval, the stored ``status.message`` collapses to its final
    value, so GE only ever sees ``100%``. This handler overrides ``on_get_task``
    to compute the *current* stage from :class:`NativeProgressTracker` at read
    time, so every poll returns an accurate, time-advanced progress line.
    """

    def __init__(
        self,
        *args: Any,
        native_progress: NativeProgressTracker,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self._native_progress = native_progress

    @override
    async def on_message_send(
        self,
        params: MessageSendParams,
        context: ServerCallContext | None = None,
    ) -> Message | Task:
        metadata = params.message.metadata or {}
        if not metadata.get("a2uiProgress"):
            config = params.configuration
            if config is None:
                config = MessageSendConfiguration(blocking=False, history_length=100)
            else:
                config = config.model_copy(
                    update={
                        "blocking": False,
                        "history_length": config.history_length or 100,
                    }
                )
            params = params.model_copy(update={"configuration": config})

        return await super().on_message_send(params, context)

    @override
    async def on_get_task(
        self,
        params: TaskQueryParams,
        context: ServerCallContext | None = None,
    ) -> Task | None:
        task = await super().on_get_task(params, context)
        if task is None or task.status.state != TaskState.working:
            return task

        message = self._native_progress.status_message(task.id)
        if message is None:
            return task

        # Return a copy so the stored task is never mutated. ``apply_history_length``
        # returns the stored object verbatim when no historyLength is requested.
        new_status = task.status.model_copy(update={"message": message})
        return task.model_copy(update={"status": new_status})
