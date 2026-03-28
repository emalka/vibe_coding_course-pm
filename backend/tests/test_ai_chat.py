import json
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai import _parse_ai_response
from app.database import get_board_for_user
from app.main import app
from tests.conftest import auth_cookie


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- _parse_ai_response tests ---

def test_parse_plain_json():
    raw = '{"message": "Hello", "board_updates": []}'
    result = _parse_ai_response(raw)
    assert result["message"] == "Hello"
    assert result["board_updates"] == []


def test_parse_json_with_markdown_fences():
    raw = '```json\n{"message": "Done", "board_updates": [{"op": "create_card"}]}\n```'
    result = _parse_ai_response(raw)
    assert result["message"] == "Done"
    assert len(result["board_updates"]) == 1


def test_parse_missing_board_updates():
    raw = '{"message": "Just chatting"}'
    result = _parse_ai_response(raw)
    assert result["message"] == "Just chatting"
    assert result["board_updates"] == []


# --- /api/ai/chat auth tests ---

async def test_ai_chat_requires_auth(client):
    res = await client.post("/api/ai/chat", json={"message": "hi"})
    assert res.status_code == 401


# --- AI responds without updates -> no DB changes ---

async def test_ai_chat_no_updates(client):
    cookie = await auth_cookie(client)
    ai_response = {"message": "Your board looks good!", "board_updates": []}

    with patch("app.main.chat_with_board", return_value=ai_response):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "How does my board look?", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "Your board looks good!"
    assert data["board_updates_applied"] == []


# --- AI creates a card -> card appears in DB ---

async def test_ai_chat_creates_card(client):
    cookie = await auth_cookie(client)
    board = get_board_for_user("user")
    col_id = board["columns"][0]["id"]
    initial_card_count = len(board["columns"][0]["cards"])

    ai_response = {
        "message": "Created a card for you.",
        "board_updates": [
            {"op": "create_card", "column_id": col_id, "title": "AI card", "details": "Made by AI"}
        ],
    }

    with patch("app.main.chat_with_board", return_value=ai_response):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "Add a card", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 200
    data = res.json()
    assert len(data["board_updates_applied"]) == 1
    assert data["board_updates_applied"][0]["op"] == "create_card"

    # Verify card is in DB
    board_after = get_board_for_user("user")
    assert len(board_after["columns"][0]["cards"]) == initial_card_count + 1
    new_card = board_after["columns"][0]["cards"][-1]
    assert new_card["title"] == "AI card"
    assert new_card["details"] == "Made by AI"


# --- AI moves a card -> position updated in DB ---

async def test_ai_chat_moves_card(client):
    cookie = await auth_cookie(client)
    board = get_board_for_user("user")
    # Move first card from column 0 to column 1
    card_id = board["columns"][0]["cards"][0]["id"]
    target_col_id = board["columns"][1]["id"]

    ai_response = {
        "message": "Moved the card.",
        "board_updates": [
            {"op": "move_card", "card_id": card_id, "column_id": target_col_id, "position": 0}
        ],
    }

    with patch("app.main.chat_with_board", return_value=ai_response):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "Move that card", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 200
    data = res.json()
    assert len(data["board_updates_applied"]) == 1
    assert data["board_updates_applied"][0]["op"] == "move_card"

    # Verify card moved in DB
    board_after = get_board_for_user("user")
    target_col_cards = board_after["columns"][1]["cards"]
    card_ids = [c["id"] for c in target_col_cards]
    assert card_id in card_ids


# --- AI deletes a card ---

async def test_ai_chat_deletes_card(client):
    cookie = await auth_cookie(client)
    board = get_board_for_user("user")
    card_id = board["columns"][0]["cards"][0]["id"]

    ai_response = {
        "message": "Deleted.",
        "board_updates": [{"op": "delete_card", "card_id": card_id}],
    }

    with patch("app.main.chat_with_board", return_value=ai_response):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "Delete that card", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 200
    data = res.json()
    assert len(data["board_updates_applied"]) == 1

    board_after = get_board_for_user("user")
    all_card_ids = [c["id"] for col in board_after["columns"] for c in col["cards"]]
    assert card_id not in all_card_ids


# --- AI updates a card ---

async def test_ai_chat_updates_card(client):
    cookie = await auth_cookie(client)
    board = get_board_for_user("user")
    card_id = board["columns"][0]["cards"][0]["id"]

    ai_response = {
        "message": "Updated the card title.",
        "board_updates": [
            {"op": "update_card", "card_id": card_id, "title": "New title from AI", "details": None}
        ],
    }

    with patch("app.main.chat_with_board", return_value=ai_response):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "Rename that card", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 200
    data = res.json()
    assert len(data["board_updates_applied"]) == 1

    board_after = get_board_for_user("user")
    card = next(c for col in board_after["columns"] for c in col["cards"] if c["id"] == card_id)
    assert card["title"] == "New title from AI"


# --- Conversation history is sent correctly ---

async def test_ai_chat_sends_history(client):
    cookie = await auth_cookie(client)
    history = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": '{"message": "Hi!", "board_updates": []}'},
    ]

    ai_response = {"message": "I remember our conversation!", "board_updates": []}

    with patch("app.main.chat_with_board", return_value=ai_response) as mock_chat:
        res = await client.post(
            "/api/ai/chat",
            json={"message": "Do you remember?", "conversation_history": history},
            cookies={"session": cookie},
        )
    assert res.status_code == 200

    # Verify history was passed through
    call_args = mock_chat.call_args
    assert call_args[0][1] == "Do you remember?"
    assert call_args[0][2] == history


# --- AI error handling ---

async def test_ai_chat_handles_error(client):
    cookie = await auth_cookie(client)

    with patch("app.main.chat_with_board", side_effect=Exception("API down")):
        res = await client.post(
            "/api/ai/chat",
            json={"message": "hi", "conversation_history": []},
            cookies={"session": cookie},
        )
    assert res.status_code == 502
    assert "AI request failed" in res.json()["detail"]


# --- chat_with_board builds correct messages ---

def test_chat_with_board_message_structure():
    board = {"id": 1, "name": "Test", "columns": []}
    history = [{"role": "user", "content": "prev"}]

    with patch("app.ai._get_client") as mock_get:
        from unittest.mock import MagicMock
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = '{"message": "hi", "board_updates": []}'
        mock_client.chat.completions.create.return_value = mock_resp
        mock_get.return_value = mock_client

        from app.ai import chat_with_board
        result = chat_with_board(board, "hello", history)

    assert result["message"] == "hi"
    call_args = mock_client.chat.completions.create.call_args
    messages = call_args[1]["messages"]
    assert messages[0]["role"] == "system"
    assert '"Test"' in messages[0]["content"]  # board name in system prompt
    assert messages[1] == {"role": "user", "content": "prev"}  # history
    assert messages[2] == {"role": "user", "content": "hello"}  # current message
