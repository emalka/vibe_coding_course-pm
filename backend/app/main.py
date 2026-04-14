import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.ai import chat_completion, chat_with_board
from app.database import (
    clear_all_sessions,
    create_card as db_create_card,
    create_session,
    delete_card as db_delete_card,
    delete_session,
    get_board_for_user,
    get_session_user,
    init_db,
    move_card as db_move_card,
    rename_column as db_rename_column,
    update_card as db_update_card,
    verify_user,
)

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=255)
    password: str = Field(..., max_length=255)


class RenameColumnRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class CreateCardRequest(BaseModel):
    column_id: int
    title: str = Field(..., min_length=1, max_length=255)
    details: str = Field("", max_length=5000)


class UpdateCardRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    details: str | None = Field(None, max_length=5000)


class MoveCardRequest(BaseModel):
    column_id: int
    position: int


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[dict] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Kanban Studio API", lifespan=lifespan)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    import uuid
    request_id = uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


def _get_user(session: str | None) -> str | None:
    if not session:
        return None
    return get_session_user(session)


def _require_user(session: str | None) -> str:
    username = _get_user(session)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/login")
async def login(body: LoginRequest, response: Response):
    if not verify_user(body.username, body.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_session(body.username)
    response.set_cookie(
        key="session",
        value=token,
        httponly=True,
        samesite="strict",  # prevent cross-site request forgery
        max_age=60 * 60 * 24,
    )
    return {"ok": True, "username": body.username}


@app.post("/api/logout")
async def logout(response: Response, session: str | None = Cookie(default=None)):
    if session:
        delete_session(session)
    response.delete_cookie(key="session")
    return {"ok": True}


@app.get("/api/me")
async def me(session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"username": username}


@app.get("/api/board")
async def board(session: str | None = Cookie(default=None)):
    username = _require_user(session)
    data = get_board_for_user(username)
    if data is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return data


@app.put("/api/columns/{column_id}")
async def update_column(column_id: int, body: RenameColumnRequest, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    if not db_rename_column(column_id, body.title, username):
        raise HTTPException(status_code=404, detail="Column not found")
    return {"ok": True}


@app.post("/api/cards")
async def create_card(body: CreateCardRequest, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    card = db_create_card(body.column_id, body.title, body.details, username)
    if card is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return card


@app.put("/api/cards/{card_id}")
async def update_card(card_id: int, body: UpdateCardRequest, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    if not db_update_card(card_id, username, title=body.title, details=body.details):
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}


@app.delete("/api/cards/{card_id}")
async def delete_card(card_id: int, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    if not db_delete_card(card_id, username):
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}


@app.put("/api/cards/{card_id}/move")
async def move_card_endpoint(card_id: int, body: MoveCardRequest, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    if not db_move_card(card_id, body.column_id, body.position, username):
        raise HTTPException(status_code=404, detail="Card not found")
    return {"ok": True}


@app.post("/api/ai/chat")
async def ai_chat(body: ChatRequest, session: str | None = Cookie(default=None)):
    username = _require_user(session)
    board_data = get_board_for_user(username)
    if board_data is None:
        raise HTTPException(status_code=404, detail="Board not found")
    try:
        result = chat_with_board(board_data, body.message, body.conversation_history)
    except Exception:
        logger.exception("AI request failed")
        raise HTTPException(status_code=502, detail="AI request failed")
    applied = _apply_board_updates(result.get("board_updates", []), username)
    # Return the updated board so the frontend can apply changes without a separate fetch
    updated_board = get_board_for_user(username)
    return {"message": result.get("message", ""), "board_updates_applied": applied, "board": updated_board}


def _apply_board_updates(updates: list[dict], username: str) -> list[dict]:
    """Apply board operations from AI response. Returns per-op results including failures."""
    applied = []
    for op in updates:
        kind = op.get("op")
        if kind == "create_card":
            card = db_create_card(op["column_id"], op["title"], op.get("details", ""), username)
            if card:
                applied.append({"op": "create_card", "success": True, "card": card})
            else:
                applied.append({"op": "create_card", "success": False, "reason": "column not found"})
        elif kind == "update_card":
            ok = db_update_card(op["card_id"], username, title=op.get("title"), details=op.get("details"))
            applied.append({"op": "update_card", "card_id": op["card_id"], "success": ok})
        elif kind == "move_card":
            ok = db_move_card(op["card_id"], op["column_id"], op["position"], username)
            applied.append({"op": "move_card", "card_id": op["card_id"], "success": ok})
        elif kind == "delete_card":
            ok = db_delete_card(op["card_id"], username)
            applied.append({"op": "delete_card", "card_id": op["card_id"], "success": ok})
    return applied


@app.post("/api/ai/test")
async def ai_test(session: str | None = Cookie(default=None)):
    _require_user(session)
    try:
        answer = chat_completion("What is 2+2?")
    except Exception:
        logger.exception("AI test request failed")
        raise HTTPException(status_code=502, detail="AI request failed")
    return {"response": answer}


# Serve static frontend — must be after API routes
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
