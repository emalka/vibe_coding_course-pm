import json
import os

from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.environ.get("AI_MODEL", "openai/gpt-oss-120b")

SYSTEM_PROMPT = """\
You are a helpful project management assistant for a Kanban board app.

The user's current board state is provided below as JSON. Each column has an id, title, position, and a list of cards. Each card has an id, title, and position.

BOARD STATE:
{board_json}

You can help the user by answering questions AND by making changes to the board. \
When you need to make changes, include them in the board_updates array. \
Available operations:

1. create_card: {{ "op": "create_card", "column_id": <int>, "title": "<string>", "details": "<string>" }}
2. update_card: {{ "op": "update_card", "card_id": <int>, "title": "<string or null>", "details": "<string or null>" }}
3. move_card: {{ "op": "move_card", "card_id": <int>, "column_id": <int>, "position": <int> }}
4. delete_card: {{ "op": "delete_card", "card_id": <int> }}

You MUST respond with valid JSON in this exact format (no markdown, no extra text):
{{
  "message": "<your text response to the user>",
  "board_updates": []
}}

If no board changes are needed, return an empty board_updates array. \
When creating multiple cards, include multiple operations in board_updates. \
Use the actual column IDs and card IDs from the board state above. \
Position 0 means the top of a column.\
"""


def _get_client() -> OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    return OpenAI(base_url=OPENROUTER_BASE_URL, api_key=api_key)


def _compact_board(board: dict) -> dict:
    """Strip card details from board before sending to AI to reduce token usage."""
    return {
        "id": board["id"],
        "name": board["name"],
        "columns": [
            {
                "id": col["id"],
                "title": col["title"],
                "position": col["position"],
                "cards": [
                    {"id": c["id"], "title": c["title"], "position": c["position"]}
                    for c in col.get("cards", [])
                ],
            }
            for col in board.get("columns", [])
        ],
    }


def chat_completion(prompt: str) -> str:
    """Send a simple prompt to OpenRouter and return the response text."""
    client = _get_client()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


def chat_with_board(board: dict, message: str, conversation_history: list[dict]) -> dict:
    """Send a chat message with compact board context to OpenRouter. Returns parsed structured output."""
    client = _get_client()

    board_json = json.dumps(_compact_board(board), indent=2)
    system = SYSTEM_PROMPT.format(board_json=board_json)

    messages = [{"role": "system", "content": system}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": message})

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
    )

    raw = response.choices[0].message.content or "{}"
    return _parse_ai_response(raw)


def _parse_ai_response(raw: str) -> dict:
    """Parse AI response JSON, handling markdown fences if present."""
    text = raw.strip()
    if text.startswith("```"):
        # Strip ```json ... ``` wrapper
        lines = text.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    parsed = json.loads(text)

    return {
        "message": parsed.get("message", ""),
        "board_updates": parsed.get("board_updates", []),
    }
