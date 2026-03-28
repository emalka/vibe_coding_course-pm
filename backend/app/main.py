import secrets
from pathlib import Path

from fastapi import Cookie, FastAPI, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Kanban Studio API")

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"

HARDCODED_USER = "user"
HARDCODED_PASSWORD = "password"

# In-memory session store: token -> username
sessions: dict[str, str] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/login")
async def login(body: LoginRequest, response: Response):
    if body.username == HARDCODED_USER and body.password == HARDCODED_PASSWORD:
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
    if session and session in sessions:
        return {"username": sessions[session]}
    return Response(
        content='{"detail": "Not authenticated"}',
        status_code=401,
        media_type="application/json",
    )


# Serve static frontend - must be after API routes
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
