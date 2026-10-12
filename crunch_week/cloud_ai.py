"""Ollama Cloud chat: one request, strict validation, no provider fallback."""
from __future__ import annotations

import json

import httpx
from pydantic import BaseModel, ValidationError

from crunch_week.ai_config import AIConfig


def cloud_json(config: AIConfig, schema: type[BaseModel], instructions: str, messages: list[dict]) -> BaseModel:
    # The cloud endpoint does not support structured-output format. Ask for JSON
    # in the prompt, then validate it before the existing proposal review flow.
    # Keep the URL fixed: never send a cloud credential to a configured local URL.
    payload = {
        "model": config.model,
        "messages": [{"role": "system", "content": instructions
                      + "\nReturn only a JSON object, without prose, matching this schema:\n"
                      + json.dumps(schema.model_json_schema())}] + messages,
        "stream": False,
        "options": {"temperature": 0, "num_predict": 2500},
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=5.0),
                          follow_redirects=False, trust_env=False) as client:
            response = client.post("https://ollama.com/api/chat", json=payload,
                                   headers={"Authorization": f"Bearer {config.api_key}"})
            if response.status_code in {401, 403}:
                raise ValueError("Ollama Cloud rejected the key or model access. Check your key and account's available models. Your plan has not changed.")
            if response.status_code in {402, 429}:
                raise ValueError("Ollama Cloud's usage or credit limit was reached. Check your account before trying again. Your plan has not changed.")
            if response.status_code != 200:
                raise ValueError("Ollama Cloud is unavailable for this model. Check OLLAMA_CLOUD_MODEL or try again later. Your plan has not changed.")
            data = response.json()
            if data.get("done") is not True or data.get("done_reason") != "stop":
                raise ValueError("Ollama Cloud could not finish a proposal. Try a shorter request. Your plan has not changed.")
            content = data["message"]["content"]
            if not isinstance(content, str) or len(content) > 100000:
                raise ValueError("Ollama Cloud returned an invalid proposal. Your plan has not changed.")
            content = content.strip()
            if content.startswith("```json\n") and content.endswith("\n```"):
                content = content[8:-4]
            return schema.model_validate_json(content)
    except httpx.HTTPError:
        raise ValueError("Ollama Cloud could not be reached in time. Try again later. Your plan has not changed.") from None
    except (ValidationError, KeyError, TypeError, AttributeError, json.JSONDecodeError):
        raise ValueError("Ollama Cloud returned an invalid proposal. Try a more specific request. Your plan has not changed.") from None
