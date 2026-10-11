"""Server-only provider settings. Validation never includes credential values."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit


class AIConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class AIConfig:
    provider: str
    label: str
    api_key: str = field(repr=False)
    model: str
    base_url: str


def azure_base_url(endpoint: str) -> str:
    message = (
        "Set AZURE_OPENAI_ENDPOINT to your HTTPS Azure OpenAI resource endpoint "
        "(ending in .openai.azure.com or .services.ai.azure.com), optionally with /openai/v1/. "
        "Use the model endpoint, not a project URL ending in /api/projects/... ."
    )
    try:
        url = urlsplit(endpoint)
        if (
            url.scheme != "https"
            or not url.hostname
            or not url.hostname.endswith((".openai.azure.com", ".services.ai.azure.com"))
            or url.username is not None
            or url.password is not None
            or url.port not in (None, 443)
            or url.query
            or url.fragment
            or url.path.rstrip("/") not in ("", "/openai/v1")
        ):
            raise ValueError
    except ValueError:
        raise AIConfigurationError(message) from None
    return f"https://{url.hostname}/openai/v1/"


def load_ai_config(environ: Mapping[str, str] | None = None) -> AIConfig:
    env = os.environ if environ is None else environ
    provider = env.get("AI_PROVIDER", "openai").strip().lower() or "openai"
    if provider not in {"azure", "openai"}:
        raise AIConfigurationError("Set AI_PROVIDER to azure or openai in the backend .env file.")
    required = (
        ("AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT")
        if provider == "azure"
        else ("OPENAI_API_KEY",)
    )
    missing = [name for name in required if not env.get(name, "").strip()]
    if missing:
        raise AIConfigurationError(f"Set {', '.join(missing)} in the backend .env file, then restart the server.")
    model = (
        env["AZURE_OPENAI_DEPLOYMENT"].strip()
        if provider == "azure"
        else (env.get("OPENAI_MODEL", "").strip() or "gpt-4.1-mini")
    )
    if len(model) > 120 or any(char.isspace() for char in model):
        raise AIConfigurationError("The AI model/deployment name must have no whitespace and at most 120 characters.")
    return AIConfig(
        provider=provider,
        label="Azure AI Foundry" if provider == "azure" else "OpenAI",
        api_key=env[required[0]].strip(),
        model=model,
        base_url=azure_base_url(env["AZURE_OPENAI_ENDPOINT"].strip())
        if provider == "azure"
        else "https://api.openai.com/v1/",
    )


def ai_status() -> dict:
    """Presence/format checks only; configured does not mean live access was tested."""
    try:
        config = load_ai_config()
    except AIConfigurationError as exc:
        provider = os.getenv("AI_PROVIDER", "openai").strip().lower() or "openai"
        return {
            "ai_configured": False,
            "openai_configured": False,
            "ai_provider_name": "Azure AI Foundry" if provider == "azure" else "OpenAI",
            "ai_error": str(exc),
            "model": "",
        }
    return {
        "ai_configured": True,
        "openai_configured": config.provider == "openai",
        "ai_provider_name": config.label,
        "ai_error": None,
        "model": config.model,
    }
