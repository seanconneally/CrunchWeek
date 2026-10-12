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



def load_chat_config(environ: Mapping[str, str] | None = None) -> AIConfig:
    """Chat may use a local model independently of document extraction."""
    env = os.environ if environ is None else environ
    provider = env.get("CHAT_AI_PROVIDER", "").strip().lower()
    if provider == "ollama_cloud":
        key = env.get("OLLAMA_API_KEY", "").strip()
        if not key or key.lower() in {"your_api_key", "your-api-key", "paste-your-key-here"}:
            raise AIConfigurationError("Set OLLAMA_API_KEY in the backend .env file, then restart the server.")
        model = env.get("OLLAMA_CLOUD_MODEL", "gemma4:31b").strip()
        if not model or len(model) > 120 or any(c.isspace() for c in model) or model.endswith(":cloud"):
            raise AIConfigurationError("Set OLLAMA_CLOUD_MODEL to an Ollama Cloud API model name, such as gemma4:31b.")
        return AIConfig(provider="ollama_cloud", label="Ollama Cloud", api_key=key,
                        model=model, base_url="https://ollama.com/")
    if provider != "ollama":
        selected = dict(env)
        if provider:
            selected["AI_PROVIDER"] = provider
        return load_ai_config(selected)
    endpoint = env.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip()
    try:
        url = urlsplit(endpoint)
        if (url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}
                or url.username or url.password or url.query or url.fragment
                or url.path.rstrip("/") not in {"", "/v1"}):
            raise ValueError
        port = url.port or 11434
    except ValueError:
        raise AIConfigurationError("OLLAMA_BASE_URL must be an HTTP loopback address, such as http://127.0.0.1:11434.") from None
    model = env.get("OLLAMA_MODEL", "qwen2.5:1.5b").strip()
    if not model or len(model) > 120 or any(c.isspace() for c in model) or "cloud" in model.lower():
        raise AIConfigurationError("Choose a local OLLAMA_MODEL without whitespace or a cloud tag.")
    host = "[::1]" if url.hostname == "::1" else url.hostname
    return AIConfig(provider="ollama", label="Ollama (on this computer)", api_key="local-unused",
                    model=model, base_url=f"http://{host}:{port}/")


def chat_status() -> dict:
    """Check that a local test model is actually downloaded, not only configured."""
    import httpx

    selected_provider = os.getenv("CHAT_AI_PROVIDER", "").strip().lower()
    local = selected_provider == "ollama"
    try:
        config = load_chat_config()
        if config.provider == "ollama":
            with httpx.Client(timeout=1.5, follow_redirects=False, trust_env=False) as client:
                response = client.get(f"{config.base_url}api/tags")
                response.raise_for_status()
                names = {row.get("name") for row in response.json().get("models", [])}
            if config.model not in names and f"{config.model}:latest" not in names:
                raise AIConfigurationError("Your local chat model has not been downloaded yet. Run the local-chat launcher first.")
        return {"chat_configured": True, "chat_provider": config.provider, "chat_provider_name": config.label,
                "chat_model": config.model, "chat_local": config.provider == "ollama", "chat_error": None}
    except (AIConfigurationError, httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        detail = str(exc) if isinstance(exc, AIConfigurationError) else "Local chat is not ready on this computer. Start the local-chat launcher first."
        return {"chat_configured": False, "chat_provider_name": "Ollama (on this computer)" if local else ("Ollama Cloud" if selected_provider == "ollama_cloud" else "AI"),
                "chat_model": "", "chat_local": local, "chat_error": detail}
