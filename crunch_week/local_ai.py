"""Local-only constrained generation; there is no paid-provider fallback."""
from __future__ import annotations

import json

import httpx
from pydantic import BaseModel

from crunch_week.ai_config import AIConfig


def local_json(config: AIConfig, schema: type[BaseModel], instructions: str, messages: list[dict]) -> BaseModel:
    # No redirects or environment HTTP proxies: planning context remains on loopback.
    try:
        with httpx.Client(timeout=httpx.Timeout(120.0, connect=5.0), follow_redirects=False, trust_env=False) as client:
            response = client.post(f"{config.base_url}api/chat", json={
                "model": config.model,
                "messages": [{"role": "system", "content": instructions + "\nReturn JSON matching this schema:\n" + json.dumps(schema.model_json_schema())}] + messages,
                "format": schema.model_json_schema(), "stream": False, "keep_alive": "2m",
                "options": {"temperature": 0, "num_ctx": 16384, "num_predict": 2500},
            })
            if response.status_code != 200:
                raise ValueError("The local model is unavailable. Check that Ollama is running and the model is downloaded. Your plan has not changed.")
            data = response.json()
            if not data.get("done") or data.get("done_reason") != "stop":
                raise ValueError("The local model could not finish a proposal. Try a shorter request. Your plan has not changed.")
            return schema.model_validate_json(data["message"]["content"])
    except httpx.HTTPError as exc:
        raise ValueError("The local model could not be reached in time. Start Ollama and try again. Your plan has not changed.") from exc
    except (KeyError, TypeError) as exc:
        raise ValueError("The local model returned an invalid response. Your plan has not changed.") from exc
