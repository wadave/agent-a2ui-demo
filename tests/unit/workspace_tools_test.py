import subprocess
from unittest.mock import MagicMock

from app.workspace_tools import _run_gws, append_doc_text, create_doc, share_doc


def test_run_gws_success(monkeypatch):
    mock_run = MagicMock()
    mock_run.return_value.stdout = '{"documentId": "test_doc_id"}'
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = _run_gws(["test", "args"])
    assert result["ok"] is True
    assert result["data"]["documentId"] == "test_doc_id"


def test_run_gws_failure(monkeypatch):
    mock_run = MagicMock()
    mock_run.side_effect = subprocess.CalledProcessError(
        returncode=1, cmd="gws", stderr="error message"
    )
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = _run_gws(["test", "args"])
    assert result["ok"] is False
    assert result["error"] == "error message"


def test_run_gws_timeout(monkeypatch):
    mock_run = MagicMock()
    mock_run.side_effect = subprocess.TimeoutExpired(cmd="gws", timeout=30)
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = _run_gws(["test", "args"])
    assert result["ok"] is False
    assert result["error"] == "gws command timed out"


def test_run_gws_non_json_stdout(monkeypatch):
    mock_run = MagicMock()
    mock_run.return_value.stdout = "plain text output"
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = _run_gws(["test", "args"])
    assert result["ok"] is True
    assert result["data"]["raw"] == "plain text output"


def test_create_doc_success(monkeypatch):
    mock_run = MagicMock()
    mock_run.return_value.stdout = '{"documentId": "test_doc_id"}'
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = create_doc("My Doc")
    assert result["ok"] is True
    assert result["data"]["doc_id"] == "test_doc_id"
    assert "test_doc_id" in result["data"]["url"]


def test_append_doc_text_success(monkeypatch):
    mock_run = MagicMock()
    mock_run.return_value.stdout = "{}"
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = append_doc_text("test_doc_id", "some text")
    assert result["ok"] is True


def test_share_doc_success(monkeypatch):
    mock_run = MagicMock()
    mock_run.return_value.stdout = "{}"
    monkeypatch.setattr(subprocess, "run", mock_run)

    result = share_doc("test_doc_id", "user@example.com")
    assert result["ok"] is True
