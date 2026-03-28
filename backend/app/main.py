import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Cookie, FastAPI, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.database import (
    create_card as db_create_card,
    delete_card as db_delete_card,
    get_board_for_user,
    init_db,
    move_card as db_move_card,
    rename_column as db_rename_column,
    update_card as db_update_card,
    verify_user,
)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"

# In-memory session store: token -> username
sessions: dict[str, str] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: int
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None


class MoveCardRequest(BaseModel):
    column_id: int
    position: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Kanban Studio API", lifespan=lifespan)

_401 = Response(
    content='{"detail": "Not authenticated"}',
    status_code=401,
    media_type="application/json",
)


def _get_user(session: str | None) -> str | None:
    if session and session in sessions:
        return sessions[session]
    return None


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/login")
async def login(body: LoginRequest, response: Response):
    if verify_user(body.username, body.password):
        token = secrets.token_hex(32)
        sessions[token] = body.username
        response.set_cookie(
            key="session",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=60 * 60 * 24,
        )
        return {"ok": True, "username": body.username}
    return Response(
        content='{"ok": false, "detail": "Invalid credentials"}',
        status_code=401,
        media_type="application/json",
    )


@app.post("/api/logout")
async def logout(response: Response, session: str | None = Cookie(default=None)):
    if session and session in sessions:
        del sessions[session]
    response.delete_cookie(key="session")
    return {"ok": True}


@app.get("/api/me")
async def me(session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if username:
        return {"username": username}
    return Response(
        content='{"detail": "Not authenticated"}',
        status_code=401,
        media_type="application/json",
    )


@app.get("/api/board")
async def board(session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    data = get_board_for_user(username)
    if data is None:
        return Response(
            content='{"detail": "Board not found"}',
            status_code=404,
            media_type="application/json",
        )
    return data


@app.put("/api/columns/{column_id}")
async def update_column(column_id: int, body: RenameColumnRequest, session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    if not db_rename_column(column_id, body.title, username):
        return Response(
            content='{"detail": "Column not found"}',
            status_code=404,
            media_type="application/json",
        )
    return {"ok": True}


@app.post("/api/cards")
async def create_card(body: CreateCardRequest, session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    card = db_create_card(body.column_id, body.title, body.details, username)
    if card is None:
        return Response(
            content='{"detail": "Column not found"}',
            status_code=404,
            media_type="application/json",
        )
    return card


@app.put("/api/cards/{card_id}")
async def update_card(card_id: int, body: UpdateCardRequest, session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    if not db_update_card(card_id, username, title=body.title, details=body.details):
        return Response(
            content='{"detail": "Card not found"}',
            status_code=404,
            media_type="application/json",
        )
    return {"ok": True}


@app.delete("/api/cards/{card_id}")
async def delete_card(card_id: int, session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    if not db_delete_card(card_id, username):
        return Response(
            content='{"detail": "Card not found"}',
            status_code=404,
            media_type="application/json",
        )
    return {"ok": True}


@app.put("/api/cards/{card_id}/move")
async def move_card_endpoint(card_id: int, body: MoveCardRequest, session: str | None = Cookie(default=None)):
    username = _get_user(session)
    if not username:
        return _401
    if not db_move_card(card_id, body.column_id, body.position, username):
        return Response(
            content='{"detail": "Card not found"}',
            status_code=404,
            media_type="application/json",
        )
    return {"ok": True}


# Serve static frontend - must be after API routes
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
