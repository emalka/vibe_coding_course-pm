from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import auth_cookie


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _mock_completion(content: str):
    """Create a mock OpenAI chat completion response."""
    choice = MagicMock()
    choice.message.content = content
    resp = MagicMock()
    resp.choices = [choice]
    return resp


async def test_ai_test_requires_auth(client):
    res = await client.post("/api/ai/test")
    assert res.status_code == 401


async def test_ai_test_returns_response(client):
    cookie = await auth_cookie(client)
    with patch("app.main.chat_completion", return_value="4") as mock_cc:
        res = await client.post("/api/ai/test", cookies={"session": cookie})
    assert res.status_code == 200
    data = res.json()
    assert "4" in data["response"]
    mock_cc.assert_called_once_with("What is 2+2?")


async def test_ai_test_handles_api_error(client):
    cookie = await auth_cookie(client)
    with patch("app.main.chat_completion", side_effect=Exception("API key invalid")):
        res = await client.post("/api/ai/test", cookies={"session": cookie})
    assert res.status_code == 502
    assert "AI request failed" in res.json()["detail"]


async def test_chat_completion_calls_openrouter():
    with patch("app.ai._get_client") as mock_get:
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = _mock_completion("4")
        mock_get.return_value = mock_client

        from app.ai import chat_completion
        result = chat_completion("What is 2+2?")

    assert result == "4"
    mock_client.chat.completions.create.assert_called_once_with(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": "What is 2+2?"}],
    )
