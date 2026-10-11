import pytest

from crunch_week.ai_config import AIConfigurationError, azure_base_url, load_ai_config


@pytest.mark.parametrize("host", ["example.openai.azure.com", "example.services.ai.azure.com"])
@pytest.mark.parametrize("path", ["", "/", "/openai/v1", "/openai/v1/"])
def test_azure_root_and_v1_endpoints_are_normalized(host, path):
    assert azure_base_url(f"https://{host}{path}") == f"https://{host}/openai/v1/"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://example.openai.azure.com",
        "https://example.openai.azure.com/api/projects/project",
        "https://example.services.ai.azure.com/models",
        "https://example.openai.azure.com/openai/v1/responses",
        "https://example.openai.azure.com/?api-key=do-not-expose",
        "https://do-not-expose@example.openai.azure.com",
        "https://example.openai.azure.com.evil.test",
        "https://example.openai.azure.com:invalid",
        "https://[bad",
    ],
)
def test_incorrect_endpoints_rejected_without_echoing_values(endpoint):
    with pytest.raises(AIConfigurationError) as error:
        azure_base_url(endpoint)
    assert "do-not-expose" not in str(error.value)


def test_explicit_provider_selection_and_no_key_in_repr():
    config = load_ai_config(
        {
            "AI_PROVIDER": "azure",
            "AZURE_OPENAI_API_KEY": "test-azure-secret",
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com/",
            "AZURE_OPENAI_DEPLOYMENT": "custom-deployment-name",
            "OPENAI_API_KEY": "unused-secret",
        }
    )
    assert config.model == "custom-deployment-name"
    assert config.api_key == "test-azure-secret"
    assert "secret" not in repr(config)


def test_existing_openai_configuration_remains_supported():
    config = load_ai_config({"OPENAI_API_KEY": "test-key"})
    assert config.provider == "openai" and config.model == "gpt-4.1-mini"
    assert config.base_url == "https://api.openai.com/v1/"


def test_invalid_provider_rejected_without_echo():
    with pytest.raises(AIConfigurationError, match="AI_PROVIDER") as error:
        load_ai_config({"AI_PROVIDER": "secret-accidentally-pasted-here"})
    assert "secret" not in str(error.value)


def test_missing_azure_values_do_not_use_openai_key():
    with pytest.raises(AIConfigurationError, match="AZURE_OPENAI_API_KEY"):
        load_ai_config({"AI_PROVIDER": "azure", "OPENAI_API_KEY": "unused-secret"})
