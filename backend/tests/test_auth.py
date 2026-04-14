import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    res = await client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    res = await client.post("/api/login", json={"username": "user", "password": "password"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["username"] == "user"
    assert "session" in res.cookies


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    res = await client.post("/api/login", json={"username": "user", "password": "wrong"})
    assert res.status_code == 401
    assert "detail" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_username(client: AsyncClient):
    res = await client.post("/api/login", json={"username": "nope", "password": "password"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_not_authenticated(client: AsyncClient):
    res = await client.get("/api/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient):
    login_res = await client.post("/api/login", json={"username": "user", "password": "password"})
    cookie = login_res.cookies["session"]
    res = await client.get("/api/me", cookies={"session": cookie})
    assert res.status_code == 200
    assert res.json()["username"] == "user"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    login_res = await client.post("/api/login", json={"username": "user", "password": "password"})
    cookie = login_res.cookies["session"]
    logout_res = await client.post("/api/logout", cookies={"session": cookie})
    assert logout_res.status_code == 200
    # Session should be invalidated
    me_res = await client.get("/api/me", cookies={"session": cookie})
    assert me_res.status_code == 401


@pytest.mark.asyncio
async def test_logout_without_session(client: AsyncClient):
    res = await client.post("/api/logout")
    assert res.status_code == 200
