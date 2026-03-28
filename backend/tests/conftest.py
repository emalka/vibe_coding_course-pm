import pytest
from httpx import ASGITransport, AsyncClient

import app.database as database
from app.main import app, sessions


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path):
    original = database._db_path
    database._db_path = str(tmp_path / "test.db")
    database.init_db()
    yield
    database._db_path = original


@pytest.fixture(autouse=True)
def clear_sessions():
    sessions.clear()
    yield
    sessions.clear()


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def auth_cookie(client: AsyncClient) -> str:
    """Login and return session cookie."""
    res = await client.post("/api/login", json={"username": "user", "password": "password"})
    return res.cookies["session"]
