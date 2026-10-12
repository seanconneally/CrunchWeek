import json

import httpx
import pytest
from pydantic import BaseModel
from test_assistant_estimates import NOW

from crunch_week.ai_config import AIConfigurationError, chat_status, load_chat_config
from crunch_week.assistant import ChatMessage, interpret
from crunch_week.cloud_ai import cloud_json


class Result(BaseModel):
    answer: str


def cloud_config():
    return load_chat_config({"CHAT_AI_PROVIDER": "ollama_cloud", "OLLAMA_API_KEY": "test-cloud-key",
                             "OLLAMA_BASE_URL": "http://localhost:11434"})


def mock_http(monkeypatch, handler):
    original = httpx.Client
    def factory(**kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
        return original(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(httpx, "Client", factory)


def test_cloud_config_requires_key_and_never_uses_local_endpoint():
    with pytest.raises(AIConfigurationError, match="OLLAMA_API_KEY"):
        load_chat_config({"CHAT_AI_PROVIDER": "ollama_cloud", "OLLAMA_API_KEY": ""})
    config = cloud_config()
    assert config.provider == "ollama_cloud"
    assert config.base_url == "https://ollama.com/"
    assert config.model == "gemma4:31b"
    assert "test-cloud-key" not in repr(config)


def test_cloud_status_is_remote_and_has_no_secret(monkeypatch):
    monkeypatch.setenv("CHAT_AI_PROVIDER", "ollama_cloud")
    monkeypatch.setenv("OLLAMA_API_KEY", "test-cloud-key")
    status = chat_status()
    assert status["chat_local"] is False
    assert status["chat_provider"] == "ollama_cloud"
    assert status["chat_provider_name"] == "Ollama Cloud"
    assert "test-cloud-key" not in json.dumps(status)
    monkeypatch.setenv("OLLAMA_API_KEY", "")
    assert chat_status()["chat_configured"] is False


@pytest.mark.parametrize("content", ['{"answer":"ok"}', '```json\n{"answer":"ok"}\n```'])
def test_cloud_single_validated_request_without_unsupported_format(monkeypatch, content):
    calls = []
    def handle(request):
        calls.append(request)
        assert str(request.url) == "https://ollama.com/api/chat"
        assert request.headers["Authorization"] == "Bearer test-cloud-key"
        body = json.loads(request.content)
        assert "format" not in body
        assert "keep_alive" not in body
        assert body["stream"] is False
        assert body["options"]["num_predict"] == 2500
        assert "test-cloud-key" not in request.content.decode()
        return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {"content": content}})
    mock_http(monkeypatch, handle)
    assert cloud_json(cloud_config(), Result, "Schedule only", []).answer == "ok"
    assert len(calls) == 1


@pytest.mark.parametrize("status", [401, 403, 402, 429, 500, 302])
def test_cloud_failure_never_retries_or_exposes_provider_body(monkeypatch, status):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, text="test-cloud-key secret-provider-body")
    mock_http(monkeypatch, handle)
    with pytest.raises(ValueError) as exc:
        cloud_json(cloud_config(), Result, "Schedule only", [])
    assert "secret-provider-body" not in str(exc.value)
    assert "test-cloud-key" not in str(exc.value)
    assert len(calls) == 1


@pytest.mark.parametrize("data", [
    {"done": True, "done_reason": "length", "message": {"content": '{"answer":"ok"}'}},
    {"done": True, "done_reason": "stop", "message": {"content": "untrusted malformed JSON"}},
    {"done": True, "done_reason": "stop", "message": {"content": "{}"}},
    {"done": True, "done_reason": "stop"},
])
def test_cloud_incomplete_or_invalid_results_are_rejected(monkeypatch, data):
    mock_http(monkeypatch, lambda _: httpx.Response(200, json=data))
    with pytest.raises(ValueError):
        cloud_json(cloud_config(), Result, "Schedule only", [])


def test_cloud_interpretation_keeps_minimal_context_and_does_not_apply_changes(monkeypatch, project):
    original = project.model_dump_json()
    def forbidden(**_):
        raise AssertionError("No paid-provider fallback allowed")
    monkeypatch.setattr("crunch_week.assistant.OpenAI", forbidden)
    def handle(request):
        body = json.loads(request.content)
        context = json.loads(body["messages"][1]["content"].split("Planning context:\n")[1])
        assert "evidence" not in context["assessments"][0]
        assert "study_history" not in context
        return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {"content": json.dumps({
            "intent": "schedule", "help_topic": None, "message": "What times?",
            "questions": ["What days and times is training?"], "commitments": [], "effort_changes": [],
        })}})
    mock_http(monkeypatch, handle)
    result = interpret(project, [ChatMessage(role="user", content="I have training")], cloud_config(), NOW)
    assert result.questions
    assert project.model_dump_json() == original
