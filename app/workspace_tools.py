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

"""Google Workspace tools supporting both gws CLI (local) and SDK/ADC (Cloud Run)."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any, Literal

import google.auth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

_USE_ADC = os.getenv("K_SERVICE") is not None or os.getenv("USE_ADC") == "TRUE"

# Resolve presentation-skill paths relative to this file so the slide tools
# work regardless of where the repo is checked out.
_APP_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_APP_DIR)
_PRESENTATION_SKILL_DIR = os.path.join(
    _APP_DIR,
    "skills",
    "presentation-skill",
)
_PRESENTATION_SKILL_CLI = os.path.join(_PRESENTATION_SKILL_DIR, "scripts", "cli.py")
_PRESENTATION_SKILL_DEFAULT_TEMPLATE = os.path.join(
    _PRESENTATION_SKILL_DIR, "resources", "template.pptx"
)


def _resolve_gws_bin() -> str:
    """Locate the `gws` binary: PATH first, then repo-local node_modules.

    Lets the wrappers work both in local dev (where `gws` is only in
    node_modules/.bin) and in environments that install it globally.
    Falls back to the bare name `"gws"` so subprocess raises a clear
    FileNotFoundError if it really isn't installed anywhere.
    """
    import shutil

    from_path = shutil.which("gws")
    if from_path:
        return from_path
    candidate = os.path.join(_REPO_ROOT, "node_modules", ".bin", "gws")
    if os.path.exists(candidate):
        return candidate
    return "gws"


_GWS_BIN = _resolve_gws_bin()

_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
]


def _get_service(service_name: str, version: str):
    """Build a Google API service client using Application Default Credentials."""
    credentials, _ = google.auth.default(scopes=_SCOPES)
    if hasattr(credentials, "with_scopes"):
        credentials = credentials.with_scopes(_SCOPES)
    return build(service_name, version, credentials=credentials)


def _get_or_create_folder_adc(drive_service, folder_name: str) -> str | None:
    """Get the ID of a folder by name via SDK."""
    try:
        q = f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        results = (
            drive_service.files()
            .list(q=q, spaces="drive", fields="files(id, name)")
            .execute()
        )
        files = results.get("files", [])
        if files:
            return files[0].get("id")

        file_metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        file = drive_service.files().create(body=file_metadata, fields="id").execute()
        return file.get("id")
    except Exception:
        return None


def _move_file_to_folder_adc(drive_service, file_id: str, folder_id: str) -> bool:
    """Move a file to a parent folder via SDK."""
    try:
        file = drive_service.files().get(fileId=file_id, fields="parents").execute()
        previous_parents = ",".join(file.get("parents", []))
        drive_service.files().update(
            fileId=file_id,
            addParents=folder_id,
            removeParents=previous_parents,
            fields="id, parents",
        ).execute()
        return True
    except Exception:
        return False


def _run_gws(args: list[str]) -> dict[str, Any]:
    """Execute a gws CLI command locally."""
    cmd = [_GWS_BIN, *args]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=30
        )
        stdout = result.stdout.strip()
        try:
            return {"ok": True, "data": json.loads(stdout)}
        except json.JSONDecodeError:
            return {"ok": True, "data": {"raw": stdout}}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "gws command timed out"}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": e.stderr.strip() or e.stdout.strip()}


def gws_call(
    service: str,
    resource: str,
    method: str,
    sub_resource: str = "",
    params: str = "",
    json_body: str = "",
    upload_path: str = "",
    page_all: bool = False,
    page_limit: int = 10,
) -> dict[str, Any]:
    """Invoke the Google Workspace CLI (`gws`) as a single ADK tool call.

    The `gws` CLI shape is `gws <service> <resource> [sub_resource] <method>
    [--params JSON] [--json JSON] [--upload PATH] [--page-all]`. This wrapper
    is the ADK bridge: every `gws-*` skill that documents a shell invocation
    should be translated into one call to this tool.

    Args:
        service: Top-level service (e.g. "docs", "sheets", "slides", "drive").
        resource: Resource collection (e.g. "documents", "spreadsheets",
            "presentations", "files").
        method: Method to call (e.g. "create", "get", "batchUpdate", "list").
        sub_resource: Optional sub-resource for nested APIs (e.g.
            "values" for sheets.spreadsheets.values).
        params: URL/query parameters as a JSON-encoded string (e.g.
            ``'{"documentId":"abc"}'``). Empty string means none. JSON
            strings rather than dicts because Gemini's tool-schema validator
            rejects open-object types.
        json_body: Request body as a JSON-encoded string (e.g.
            ``'{"requests":[{"insertText":...}]}'``). Empty string means none.
        upload_path: Local file path to upload as multipart media.
        page_all: When true, auto-paginate list calls. Returns a list of pages.
        page_limit: Max pages when `page_all` is true.

    Returns:
        ``{"ok": True, "data": <parsed-json>}`` on success, or
        ``{"ok": False, "error": "<message>"}`` on failure.
    """
    cmd: list[str] = [_GWS_BIN, service, resource]
    if sub_resource:
        cmd.append(sub_resource)
    cmd.append(method)
    if params:
        cmd.extend(["--params", params])
    if json_body:
        cmd.extend(["--json", json_body])
    if upload_path:
        cmd.extend(["--upload", upload_path])
    if page_all:
        cmd.append("--page-all")
        if page_limit and page_limit != 10:
            cmd.extend(["--page-limit", str(page_limit)])

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=60
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "error": (
                "gws CLI not found on PATH. Install @googleworkspace/cli "
                "(npx @googleworkspace/cli or npm i -g @googleworkspace/cli) "
                "and run `gws auth login` once."
            ),
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "gws command timed out after 60s"}
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": (e.stderr or e.stdout or "").strip()}

    stdout = result.stdout.strip()
    if not stdout:
        return {"ok": True, "data": None}
    if page_all:
        try:
            pages = [json.loads(line) for line in stdout.splitlines() if line.strip()]
            return {"ok": True, "data": pages}
        except json.JSONDecodeError as e:
            return {"ok": False, "error": f"failed to parse NDJSON page output: {e}"}
    try:
        return {"ok": True, "data": json.loads(stdout)}
    except json.JSONDecodeError:
        return {"ok": True, "data": {"raw": stdout}}


def _get_or_create_folder_cli(folder_name: str) -> str | None:
    """Get or create folder via CLI."""
    res = _run_gws(
        [
            "drive",
            "files",
            "list",
            "--params",
            json.dumps(
                {
                    "q": f"name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
                }
            ),
        ]
    )
    if res["ok"] and isinstance(res["data"], dict) and "files" in res["data"]:
        files = res["data"]["files"]
        if files:
            return files[0].get("id")

    create_res = _run_gws(
        [
            "drive",
            "files",
            "create",
            "--json",
            json.dumps(
                {
                    "name": folder_name,
                    "mimeType": "application/vnd.google-apps.folder",
                }
            ),
        ]
    )
    if create_res["ok"] and isinstance(create_res["data"], dict):
        return create_res["data"].get("id")
    return None


def _move_file_to_folder_cli(file_id: str, folder_id: str) -> bool:
    """Move file via CLI."""
    get_res = _run_gws(
        ["drive", "files", "get", "--params", json.dumps({"fileId": file_id})]
    )
    if not get_res["ok"] or not isinstance(get_res["data"], dict):
        return False

    parents = get_res["data"].get("parents", [])
    remove_parents = ",".join(parents)

    move_res = _run_gws(
        [
            "drive",
            "files",
            "update",
            "--params",
            json.dumps(
                {
                    "fileId": file_id,
                    "addParents": folder_id,
                    "removeParents": remove_parents,
                }
            ),
        ]
    )
    return move_res["ok"]


def create_doc(title: str, folder_name: str | None = None) -> dict[str, Any]:
    """Create an empty Google Doc."""
    if _USE_ADC:
        try:
            docs_service = _get_service("docs", "v1")
            drive_service = _get_service("drive", "v3")
            doc = docs_service.documents().create(body={"title": title}).execute()
            doc_id = doc.get("documentId")

            if folder_name:
                folder_id = _get_or_create_folder_adc(drive_service, folder_name)
                if folder_id:
                    _move_file_to_folder_adc(drive_service, doc_id, folder_id)

            return {
                "ok": True,
                "data": {
                    "doc_id": doc_id,
                    "url": f"https://docs.google.com/document/d/{doc_id}/edit",
                },
            }
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        res = _run_gws(
            [
                "docs",
                "documents",
                "create",
                "--json",
                json.dumps({"title": title}),
            ]
        )
        if not res["ok"]:
            return res

        doc_id = res["data"].get("documentId")
        if folder_name:
            folder_id = _get_or_create_folder_cli(folder_name)
            if folder_id:
                _move_file_to_folder_cli(doc_id, folder_id)

        return {
            "ok": True,
            "data": {
                "doc_id": doc_id,
                "url": f"https://docs.google.com/document/d/{doc_id}/edit",
            },
        }


def append_doc_text(document_id: str, text: str) -> dict[str, Any]:
    """Append text to a doc."""
    if _USE_ADC:
        try:
            docs_service = _get_service("docs", "v1")
            requests = [{"insertText": {"endOfSegmentLocation": {}, "text": text}}]
            docs_service.documents().batchUpdate(
                documentId=document_id, body={"requests": requests}
            ).execute()
            return {"ok": True}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        body = {"requests": [{"insertText": {"text": text}}]}
        return _run_gws(
            [
                "docs",
                "documents",
                "batchUpdate",
                "--params",
                json.dumps({"documentId": document_id}),
                "--json",
                json.dumps(body),
            ]
        )


def share_doc(
    document_id: str,
    email: str,
    role: Literal["reader", "commenter", "writer"] = "reader",
) -> dict[str, Any]:
    """Share Drive file."""
    if _USE_ADC:
        try:
            drive_service = _get_service("drive", "v3")
            user_permission = {
                "type": "user",
                "role": role,
                "emailAddress": email,
            }
            drive_service.permissions().create(
                fileId=document_id, body=user_permission
            ).execute()
            return {"ok": True}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        body = {"type": "user", "role": role, "emailAddress": email}
        return _run_gws(
            [
                "drive",
                "permissions",
                "create",
                "--params",
                json.dumps({"fileId": document_id}),
                "--json",
                json.dumps(body),
            ]
        )


def share_anyone_with_link(
    file_id: str,
    role: Literal["reader", "commenter", "writer"] = "reader",
) -> dict[str, Any]:
    """Grant 'anyone with the link' access to a Drive file.

    Required so the A2UI Drive-preview iframe (`/preview` URL) loads for
    the user in the browser. Without this, the file is private to the
    service account that created it and the iframe shows a "request
    access" page.
    """
    body = {"type": "anyone", "role": role}
    if _USE_ADC:
        try:
            drive_service = _get_service("drive", "v3")
            drive_service.permissions().create(fileId=file_id, body=body).execute()
            return {"ok": True}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        return _run_gws(
            [
                "drive",
                "permissions",
                "create",
                "--params",
                json.dumps({"fileId": file_id}),
                "--json",
                json.dumps(body),
            ]
        )


def create_sheet(title: str, folder_name: str | None = None) -> dict[str, Any]:
    """Create empty Sheet."""
    if _USE_ADC:
        try:
            sheets_service = _get_service("sheets", "v4")
            drive_service = _get_service("drive", "v3")
            spreadsheet = {"properties": {"title": title}}
            ss = (
                sheets_service.spreadsheets()
                .create(body=spreadsheet, fields="spreadsheetId")
                .execute()
            )
            sheet_id = ss.get("spreadsheetId")

            if folder_name:
                folder_id = _get_or_create_folder_adc(drive_service, folder_name)
                if folder_id:
                    _move_file_to_folder_adc(drive_service, sheet_id, folder_id)

            return {
                "ok": True,
                "data": {
                    "sheet_id": sheet_id,
                    "url": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit",
                },
            }
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        res = _run_gws(
            [
                "sheets",
                "spreadsheets",
                "create",
                "--json",
                json.dumps({"properties": {"title": title}}),
            ]
        )
        if not res["ok"]:
            return res

        sheet_id = res["data"].get("spreadsheetId")
        if folder_name:
            folder_id = _get_or_create_folder_cli(folder_name)
            if folder_id:
                _move_file_to_folder_cli(sheet_id, folder_id)

        return {
            "ok": True,
            "data": {
                "sheet_id": sheet_id,
                "url": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit",
            },
        }


def append_sheet_data(
    spreadsheet_id: str,
    values: list[list[Any]],
    range_name: str = "Sheet1!A1",
    value_input_option: Literal["RAW", "USER_ENTERED"] = "USER_ENTERED",
) -> dict[str, Any]:
    """Append Sheet data."""
    if _USE_ADC:
        try:
            sheets_service = _get_service("sheets", "v4")
            body = {"values": values}
            (
                sheets_service.spreadsheets()
                .values()
                .append(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueInputOption=value_input_option,
                    insertDataOption="INSERT_ROWS",
                    body=body,
                )
                .execute()
            )
            return {"ok": True}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        body = {"values": values}
        return _run_gws(
            [
                "sheets",
                "spreadsheets",
                "values",
                "append",
                "--params",
                json.dumps(
                    {
                        "spreadsheetId": spreadsheet_id,
                        "range": range_name,
                        "valueInputOption": value_input_option,
                        "insertDataOption": "INSERT_ROWS",
                    }
                ),
                "--json",
                json.dumps(body),
            ]
        )


def create_presentation(title: str, folder_name: str | None = None) -> dict[str, Any]:
    """Create empty presentation."""
    if _USE_ADC:
        try:
            slides_service = _get_service("slides", "v1")
            drive_service = _get_service("drive", "v3")
            presentation = {"title": title}
            pres = slides_service.presentations().create(body=presentation).execute()
            presentation_id = pres.get("presentationId")

            if folder_name:
                folder_id = _get_or_create_folder_adc(drive_service, folder_name)
                if folder_id:
                    _move_file_to_folder_adc(drive_service, presentation_id, folder_id)

            return {
                "ok": True,
                "data": {
                    "presentation_id": presentation_id,
                    "url": f"https://docs.google.com/presentation/d/{presentation_id}/edit",
                },
            }
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        res = _run_gws(
            [
                "slides",
                "presentations",
                "create",
                "--json",
                json.dumps({"title": title}),
            ]
        )
        if not res["ok"]:
            return res

        presentation_id = res["data"].get("presentationId")
        if folder_name:
            folder_id = _get_or_create_folder_cli(folder_name)
            if folder_id:
                _move_file_to_folder_cli(presentation_id, folder_id)

        return {
            "ok": True,
            "data": {
                "presentation_id": presentation_id,
                "url": f"https://docs.google.com/presentation/d/{presentation_id}/edit",
            },
        }


def add_presentation_slide(
    presentation_id: str, title: str, body_text: str
) -> dict[str, Any]:
    """Add slide via batchUpdate."""
    if _USE_ADC:
        try:
            slides_service = _get_service("slides", "v1")
            import uuid

            slide_id = f"slide_{uuid.uuid4().hex[:8]}"
            title_id = f"title_{uuid.uuid4().hex[:8]}"
            body_id = f"body_{uuid.uuid4().hex[:8]}"

            requests = [
                {"createSlide": {"objectId": slide_id}},
                {
                    "createShape": {
                        "objectId": title_id,
                        "shapeType": "TEXT_BOX",
                        "elementProperties": {
                            "pageObjectId": slide_id,
                            "size": {
                                "width": {"magnitude": 6000000, "unit": "EMU"},
                                "height": {"magnitude": 1000000, "unit": "EMU"},
                            },
                            "transform": {
                                "scaleX": 1,
                                "scaleY": 1,
                                "translateX": 500000,
                                "translateY": 500000,
                                "unit": "EMU",
                            },
                        },
                    }
                },
                {"insertText": {"objectId": title_id, "text": title}},
                {
                    "createShape": {
                        "objectId": body_id,
                        "shapeType": "TEXT_BOX",
                        "elementProperties": {
                            "pageObjectId": slide_id,
                            "size": {
                                "width": {"magnitude": 6000000, "unit": "EMU"},
                                "height": {"magnitude": 3000000, "unit": "EMU"},
                            },
                            "transform": {
                                "scaleX": 1,
                                "scaleY": 1,
                                "translateX": 500000,
                                "translateY": 1800000,
                                "unit": "EMU",
                            },
                        },
                    }
                },
                {"insertText": {"objectId": body_id, "text": body_text}},
            ]

            (
                slides_service.presentations()
                .batchUpdate(
                    presentationId=presentation_id, body={"requests": requests}
                )
                .execute()
            )
            return {"ok": True}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        import uuid

        slide_id = f"slide_{uuid.uuid4().hex[:8]}"
        title_id = f"title_{uuid.uuid4().hex[:8]}"
        body_id = f"body_{uuid.uuid4().hex[:8]}"

        requests = [
            {"createSlide": {"objectId": slide_id}},
            {
                "createShape": {
                    "objectId": title_id,
                    "shapeType": "TEXT_BOX",
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "width": {"magnitude": 6000000, "unit": "EMU"},
                            "height": {"magnitude": 1000000, "unit": "EMU"},
                        },
                        "transform": {
                            "scaleX": 1,
                            "scaleY": 1,
                            "translateX": 500000,
                            "translateY": 500000,
                            "unit": "EMU",
                        },
                    },
                }
            },
            {"insertText": {"objectId": title_id, "text": title}},
            {
                "createShape": {
                    "objectId": body_id,
                    "shapeType": "TEXT_BOX",
                    "elementProperties": {
                        "pageObjectId": slide_id,
                        "size": {
                            "width": {"magnitude": 6000000, "unit": "EMU"},
                            "height": {"magnitude": 3000000, "unit": "EMU"},
                        },
                        "transform": {
                            "scaleX": 1,
                            "scaleY": 1,
                            "translateX": 500000,
                            "translateY": 1800000,
                            "unit": "EMU",
                        },
                    },
                }
            },
            {"insertText": {"objectId": body_id, "text": body_text}},
        ]

        return _run_gws(
            [
                "slides",
                "presentations",
                "batchUpdate",
                "--params",
                json.dumps({"presentationId": presentation_id}),
                "--json",
                json.dumps({"requests": requests}),
            ]
        )


_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def upload_presentation(
    file_path: str, title: str | None = None, folder_name: str | None = None
) -> dict[str, Any]:
    """Upload a local .pptx to Drive as-is (no Google Slides conversion).

    Uploading with `mimeType=application/vnd.google-apps.presentation` triggers
    a lossy pptx → native-Slides conversion that strips custom template
    masters, layouts, and themes — exactly what we want to preserve when the
    deck was built from the bundled corporate template. So we upload the
    file with its real .pptx mimetype; Drive shows it as a PowerPoint file
    and opens it in the Slides viewer with full fidelity.
    """
    import os

    if not os.path.exists(file_path):
        return {"ok": False, "error": f"Local file not found: {file_path}"}

    # Ensure the destination keeps the .pptx extension. The LLM typically
    # passes a bare title like "restaurants0", which would otherwise land
    # in Drive without an extension and look broken.
    name = title or os.path.basename(file_path)
    if not name.lower().endswith(".pptx"):
        name = f"{name}.pptx"

    if _USE_ADC:
        try:
            drive_service = _get_service("drive", "v3")
            file_metadata = {"name": name, "mimeType": _PPTX_MIME}

            from googleapiclient.http import MediaFileUpload

            media = MediaFileUpload(file_path, mimetype=_PPTX_MIME)

            file = (
                drive_service.files()
                .create(body=file_metadata, media_body=media, fields="id")
                .execute()
            )

            file_id = file.get("id")

            if folder_name:
                folder_id = _get_or_create_folder_adc(drive_service, folder_name)
                if folder_id:
                    _move_file_to_folder_adc(drive_service, file_id, folder_id)

            return {
                "ok": True,
                "data": {
                    "file_id": file_id,
                    "url": f"https://drive.google.com/file/d/{file_id}/view",
                },
            }
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        # The gws CLI uploads media via the dedicated --upload flag, not
        # through --params. Earlier code passed `{"media": file_path}` in
        # --params which the API silently ignored, producing a 0-byte
        # placeholder.
        body = {"name": name, "mimeType": _PPTX_MIME}
        res = _run_gws(
            [
                "drive",
                "files",
                "create",
                "--json",
                json.dumps(body),
                "--upload",
                file_path,
                "--upload-content-type",
                _PPTX_MIME,
            ]
        )
        if not res["ok"]:
            return res

        file_id = res["data"].get("id")
        if folder_name:
            folder_id = _get_or_create_folder_cli(folder_name)
            if folder_id:
                _move_file_to_folder_cli(file_id, folder_id)

        return {
            "ok": True,
            "data": {
                "file_id": file_id,
                "url": f"https://drive.google.com/file/d/{file_id}/view",
            },
        }


def read_doc(document_id: str) -> dict[str, Any]:
    """Read Doc."""
    if _USE_ADC:
        try:
            docs_service = _get_service("docs", "v1")
            doc = docs_service.documents().get(documentId=document_id).execute()

            content = doc.get("body", {}).get("content", [])
            text = ""
            for element in content:
                if "paragraph" in element:
                    for part in element["paragraph"].get("elements", []):
                        if "textRun" in part:
                            text += part["textRun"].get("content", "")

            return {"ok": True, "data": {"text": text}}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        return _run_gws(
            [
                "docs",
                "documents",
                "get",
                "--params",
                json.dumps({"documentId": document_id}),
            ]
        )


def read_sheet(spreadsheet_id: str, range_name: str = "Sheet1!A:Z") -> dict[str, Any]:
    """Read Sheet."""
    if _USE_ADC:
        try:
            sheets_service = _get_service("sheets", "v4")
            result = (
                sheets_service.spreadsheets()
                .values()
                .get(spreadsheetId=spreadsheet_id, range=range_name)
                .execute()
            )
            return {"ok": True, "data": {"values": result.get("values", [])}}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        return _run_gws(
            [
                "sheets",
                "spreadsheets",
                "values",
                "get",
                "--params",
                json.dumps({"spreadsheetId": spreadsheet_id, "range": range_name}),
            ]
        )


def read_presentation(presentation_id: str) -> dict[str, Any]:
    """Read presentation."""
    if _USE_ADC:
        try:
            slides_service = _get_service("slides", "v1")
            pres = (
                slides_service.presentations()
                .get(presentationId=presentation_id)
                .execute()
            )

            slides = pres.get("slides", [])
            text = ""
            for i, slide in enumerate(slides):
                text += f"--- Slide {i + 1} ---\n"
                for element in slide.get("pageElements", []):
                    if "shape" in element and "text" in element["shape"]:
                        for part in element["shape"]["text"].get("textElements", []):
                            if "textRun" in part:
                                text += part["textRun"].get("content", "")

            return {"ok": True, "data": {"text": text}}
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        return _run_gws(
            [
                "slides",
                "presentations",
                "get",
                "--params",
                json.dumps({"presentationId": presentation_id}),
            ]
        )


def read_drive_file(file_id: str) -> dict[str, Any]:
    """Read Drive file."""
    if _USE_ADC:
        try:
            drive_service = _get_service("drive", "v3")
            import io

            from googleapiclient.http import MediaIoBaseDownload

            request = drive_service.files().get_media(fileId=file_id)
            file_stream = io.BytesIO()
            downloader = MediaIoBaseDownload(file_stream, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()

            import os
            import tempfile

            with tempfile.NamedTemporaryFile(delete=False) as tmp:
                tmp.write(file_stream.getvalue())
                tmp_path = tmp.name

            try:
                from google import genai

                client = genai.Client()
                uploaded_file = client.files.upload(file=tmp_path)

                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        uploaded_file,
                        "Extract all text content from this file. Respond with the extracted text only.",
                    ],
                )
                client.files.delete(name=uploaded_file.name)
                return {"ok": True, "data": {"text": response.text}}
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        except HttpError as e:
            return {"ok": False, "error": str(e)}
    else:
        return _run_gws(
            ["drive", "files", "get", "--params", json.dumps({"fileId": file_id})]
        )


def read_local_file(file_path: str) -> dict[str, Any]:
    """Read local file."""
    import os

    from google import genai

    if not os.path.exists(file_path):
        return {"ok": False, "error": f"Local file not found: {file_path}"}

    client = genai.Client()
    try:
        uploaded_file = client.files.upload(file=file_path)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded_file,
                "Extract all text content from this file. Respond with the extracted text only.",
            ],
        )
        client.files.delete(name=uploaded_file.name)
        return {"ok": True, "data": {"text": response.text}}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def rearrange_presentation_slides(
    template_path: str, output_path: str, indices: list[int]
) -> dict[str, Any]:
    """Rearrange slides from a template into a new working presentation.

    Args:
        template_path: Path to the source template .pptx file. Pass an empty
            string to use the bundled default Google corporate template.
        output_path: Path to save the working .pptx file.
        indices: List of 0-based slide indices from the template to include.
    """
    script_path = _PRESENTATION_SKILL_CLI
    using_default_template = not template_path
    if using_default_template:
        template_path = _PRESENTATION_SKILL_DEFAULT_TEMPLATE

    # Guard against the most common failure mode: the LLM picks
    # `[0, 4]` or `[0, 1, 4]` (cover + maybe TOC + closing) and ships a
    # deck with no body content. The bundled template has 5 slides:
    #   0 = cover, 1 = table of contents, 2 = section header,
    #   3 = blank (image-only), 4 = closing 'Thank you'.
    # NOTE: this template only supports section-header body slides
    # (index 2). For paragraph/bullet body content the caller must
    # supply a custom `template_path` with richer body layouts.
    if using_default_template:
        body_indices = [i for i in indices if i not in (0, 1, 4)]
        problems: list[str] = []
        if not indices or indices[0] != 0:
            problems.append("must start with index 0 (cover)")
        if not indices or indices[-1] != 4:
            problems.append("must end with index 4 (closing 'Thank you')")
        if len(body_indices) < 1:
            problems.append(
                f"needs at least 1 body slide between cover and closing"
                f" (got {len(body_indices)}: {body_indices})."
                f" A deck of just [0, 4] or [0, 1, 4] has no content —"
                f" repeat index 2 (section-header layout) once per outline"
                f" section, e.g. [0, 1, 2, 2, 2, 4] for 3 sections."
            )
        for idx in indices:
            if idx < 0 or idx > 4:
                problems.append(
                    f"index {idx} out of range — bundled template has 5"
                    f" slides (indices 0-4). Supply a custom template_path"
                    f" if you need richer body layouts."
                )
                break
        if problems:
            return {
                "ok": False,
                "error": "Invalid slide indices: " + "; ".join(problems),
            }

    indices_str = ",".join(map(str, indices))
    try:
        result = subprocess.run(
            [
                "python3",
                script_path,
                "rearrange",
                template_path,
                output_path,
                indices_str,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return {
            "ok": True,
            "data": {"stdout": result.stdout, "log": result.stderr.strip()},
        }
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": e.stderr.strip() or e.stdout.strip()}


def extract_presentation_inventory(
    pptx_path: str, output_json_path: str
) -> dict[str, Any]:
    """Extract text shape inventory from a PPTX file to a JSON file.

    Args:
        pptx_path: Path to the .pptx file.
        output_json_path: Path to save the extracted inventory JSON.
    """
    script_path = _PRESENTATION_SKILL_CLI
    try:
        result = subprocess.run(
            ["python3", script_path, "inventory", pptx_path, output_json_path],
            capture_output=True,
            text=True,
            check=True,
        )
        return {
            "ok": True,
            "data": {"stdout": result.stdout, "log": result.stderr.strip()},
        }
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": e.stderr.strip() or e.stdout.strip()}


def apply_presentation_replacements_data(
    pptx_path: str,
    replacements: dict[str, Any],
    output_pptx_path: str,
    cleanup: bool = True,
) -> dict[str, Any]:
    """Apply text replacements directly from a dictionary to a PPTX file.

    Args:
        pptx_path: Path to the source .pptx file.
        replacements: Dictionary mapping 'slide-N' -> 'shape-M' -> paragraphs.
        output_pptx_path: Path to save the final .pptx file.
        cleanup: Whether to delete temporary files after completion.
    """
    import json
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tmp:
        json.dump(replacements, tmp)
        tmp_path = tmp.name

    try:
        script_path = _PRESENTATION_SKILL_CLI
        cmd = [
            "python3",
            script_path,
            "replace",
            pptx_path,
            tmp_path,
            output_pptx_path,
        ]
        if cleanup:
            cmd.append("--cleanup")

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return {
            "ok": True,
            "data": {"stdout": result.stdout, "log": result.stderr.strip()},
        }
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": e.stderr.strip() or e.stdout.strip()}
    finally:
        import os

        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def apply_presentation_replacements(
    pptx_path: str,
    replacement_json_path: str,
    output_pptx_path: str,
    cleanup: bool = True,
) -> dict[str, Any]:
    """Apply text replacements from a JSON file to a PPTX file.

    Args:
        pptx_path: Path to the source .pptx file.
        replacement_json_path: Path to the JSON file containing replacements.
        output_pptx_path: Path to save the final .pptx file.
        cleanup: Whether to delete temporary files after completion.
    """
    script_path = _PRESENTATION_SKILL_CLI
    cmd = [
        "python3",
        script_path,
        "replace",
        pptx_path,
        replacement_json_path,
        output_pptx_path,
    ]
    if cleanup:
        cmd.append("--cleanup")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return {
            "ok": True,
            "data": {"stdout": result.stdout, "log": result.stderr.strip()},
        }
    except subprocess.CalledProcessError as e:
        return {"ok": False, "error": e.stderr.strip() or e.stdout.strip()}
