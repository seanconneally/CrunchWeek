import json

import httpx
import pytest
from pydantic import BaseModel
from test_assistant_estimates import NOW

from crunch_week.ai_config import AIConfigurationError, load_chat_config
from crunch_week.assistant import ChatMessage, Interpretation, interpret
from crunch_week.local_ai import local_json


class Result(BaseModel):
    answer: str


def local_config():
    return load_chat_config({"CHAT_AI_PROVIDER": "ollama", "OPENAI_API_KEY": "unused-paid-key"})


def test_local_chat_uses_no_paid_key_and_can_be_separate_from_extraction():
    config = local_config()
    assert config.provider == "ollama"
    assert config.model == "qwen2.5:1.5b"
    assert config.base_url == "http://127.0.0.1:11434/"
    assert config.api_key == "local-unused"
    assert load_chat_config({"OPENAI_API_KEY": "test-key"}).provider == "openai"


@pytest.mark.parametrize("endpoint", ["https://example.com", "http://192.168.1.1:11434", "http://user:secret@localhost:11434", "http://localhost:11434/?token=secret", "http://localhost:11434/elsewhere", "http://[bad"])
def test_only_loopback_local_endpoints_are_allowed(endpoint):
    with pytest.raises(AIConfigurationError) as error:
        load_chat_config({"CHAT_AI_PROVIDER": "ollama", "OLLAMA_BASE_URL": endpoint})
    assert "secret" not in str(error.value)


@pytest.mark.parametrize("model", ["", "qwen-cloud", "qwen:cloud", "a b"])
def test_local_mode_rejects_cloud_tags_and_invalid_models(model):
    with pytest.raises(AIConfigurationError):
        load_chat_config({"CHAT_AI_PROVIDER": "ollama", "OLLAMA_MODEL": model})


def mock_http(monkeypatch, handler):
    original = httpx.Client
    def factory(**kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
        return original(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(httpx, "Client", factory)


def test_local_output_is_constrained_validated_and_single_request(monkeypatch):
    calls = []
    def handle(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {"content": '{"answer":"ok"}'}})
    mock_http(monkeypatch, handle)
    assert local_json(local_config(), Result, "Be helpful", [{"role": "user", "content": "hello"}]).answer == "ok"
    assert len(calls) == 1
    assert calls[0]["format"] == Result.model_json_schema()
    assert calls[0]["stream"] is False
    assert calls[0]["keep_alive"] == "2m"
    assert calls[0]["options"]["temperature"] == 0


@pytest.mark.parametrize("payload", [
    {"done": True, "done_reason": "length", "message": {"content": '{"answer":"partial"}'}},
    {"done": True, "done_reason": "stop", "message": {"content": '{}'}},
    {"done": True, "done_reason": "stop"},
])
def test_incomplete_or_invalid_local_results_are_rejected(monkeypatch, payload):
    mock_http(monkeypatch, lambda _: httpx.Response(200, json=payload))
    with pytest.raises(ValueError):
        local_json(local_config(), Result, "Be helpful", [])


def test_local_interpreter_never_constructs_paid_sdk_and_sends_minimal_context(monkeypatch, project):
    def forbidden(**_):
        raise AssertionError("A paid client must never be used")
    monkeypatch.setattr("crunch_week.assistant.OpenAI", forbidden)
    def handle(request):
        payload = json.loads(request.content)
        assert payload["format"] == Interpretation.model_json_schema()
        context = json.loads(payload["messages"][1]["content"].split("Planning context:\n")[1])
        assert "evidence" not in context["assessments"][0]
        return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {"content": json.dumps({
            "intent": "schedule", "help_topic": None, "message": "What times?", "questions": ["What days and times is training?"],
            "commitments": [], "effort_changes": [],
        })}})
    mock_http(monkeypatch, handle)
    result = interpret(project, [ChatMessage(role="user", content="I have training")], local_config(), NOW)
    assert result.questions and result.commitments == []
