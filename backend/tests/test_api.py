import pytest
from httpx import AsyncClient

from tests.conftest import auth_cookie


# -- Auth required on all routes --

@pytest.mark.asyncio
async def test_board_requires_auth(client: AsyncClient):
    res = await client.get("/api/board")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_rename_column_requires_auth(client: AsyncClient):
    res = await client.put("/api/columns/1", json={"title": "X"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_create_card_requires_auth(client: AsyncClient):
    res = await client.post("/api/cards", json={"column_id": 1, "title": "X"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_update_card_requires_auth(client: AsyncClient):
    res = await client.put("/api/cards/1", json={"title": "X"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_delete_card_requires_auth(client: AsyncClient):
    res = await client.delete("/api/cards/1")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_move_card_requires_auth(client: AsyncClient):
    res = await client.put("/api/cards/1/move", json={"column_id": 2, "position": 0})
    assert res.status_code == 401


# -- GET /api/board --

@pytest.mark.asyncio
async def test_get_board(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.get("/api/board", cookies={"session": cookie})
    assert res.status_code == 200
    board = res.json()
    assert board["name"] == "My Board"
    assert len(board["columns"]) == 5
    assert board["columns"][0]["title"] == "Backlog"
    assert board["columns"][1]["title"] == "Discovery"
    assert board["columns"][2]["title"] == "In Progress"
    assert board["columns"][3]["title"] == "Review"
    assert board["columns"][4]["title"] == "Done"


@pytest.mark.asyncio
async def test_board_has_seed_cards(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.get("/api/board", cookies={"session": cookie})
    board = res.json()
    total_cards = sum(len(col["cards"]) for col in board["columns"])
    assert total_cards == 8
    # Backlog has 2 cards
    assert len(board["columns"][0]["cards"]) == 2
    assert board["columns"][0]["cards"][0]["title"] == "Align roadmap themes"


# -- PUT /api/columns/:id (rename) --

@pytest.mark.asyncio
async def test_rename_column(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put("/api/columns/1", json={"title": "New Backlog"}, cookies={"session": cookie})
    assert res.status_code == 200
    # Verify it persisted
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    assert board["columns"][0]["title"] == "New Backlog"


@pytest.mark.asyncio
async def test_rename_column_not_found(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put("/api/columns/999", json={"title": "X"}, cookies={"session": cookie})
    assert res.status_code == 404


# -- POST /api/cards (create) --

@pytest.mark.asyncio
async def test_create_card(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.post(
        "/api/cards",
        json={"column_id": 1, "title": "New card", "details": "Some details"},
        cookies={"session": cookie},
    )
    assert res.status_code == 200
    card = res.json()
    assert card["title"] == "New card"
    assert card["details"] == "Some details"
    assert card["column_id"] == 1
    assert card["position"] == 2  # Backlog already has 2 cards (positions 0, 1)
    assert "id" in card


@pytest.mark.asyncio
async def test_create_card_default_details(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.post(
        "/api/cards",
        json={"column_id": 1, "title": "No details"},
        cookies={"session": cookie},
    )
    assert res.status_code == 200
    assert res.json()["details"] == ""


@pytest.mark.asyncio
async def test_create_card_invalid_column(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.post(
        "/api/cards",
        json={"column_id": 999, "title": "X"},
        cookies={"session": cookie},
    )
    assert res.status_code == 404


# -- PUT /api/cards/:id (update) --

@pytest.mark.asyncio
async def test_update_card_title(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put("/api/cards/1", json={"title": "Updated title"}, cookies={"session": cookie})
    assert res.status_code == 200
    # Verify
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    card = board["columns"][0]["cards"][0]
    assert card["title"] == "Updated title"
    assert card["details"] == "Draft quarterly themes with impact statements and metrics."  # unchanged


@pytest.mark.asyncio
async def test_update_card_details(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put("/api/cards/1", json={"details": "New details"}, cookies={"session": cookie})
    assert res.status_code == 200
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    card = board["columns"][0]["cards"][0]
    assert card["title"] == "Align roadmap themes"  # unchanged
    assert card["details"] == "New details"


@pytest.mark.asyncio
async def test_update_card_not_found(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put("/api/cards/999", json={"title": "X"}, cookies={"session": cookie})
    assert res.status_code == 404


# -- DELETE /api/cards/:id --

@pytest.mark.asyncio
async def test_delete_card(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.delete("/api/cards/1", cookies={"session": cookie})
    assert res.status_code == 200
    # Verify card is gone and positions renumbered
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    backlog = board["columns"][0]
    assert len(backlog["cards"]) == 1
    assert backlog["cards"][0]["title"] == "Gather customer signals"
    assert backlog["cards"][0]["position"] == 0  # renumbered from 1 to 0


@pytest.mark.asyncio
async def test_delete_card_not_found(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.delete("/api/cards/999", cookies={"session": cookie})
    assert res.status_code == 404


# -- PUT /api/cards/:id/move --

@pytest.mark.asyncio
async def test_move_card_between_columns(client: AsyncClient):
    cookie = await auth_cookie(client)
    # Move card 1 (Backlog, pos 0) to Discovery (column 2) at position 0
    res = await client.put(
        "/api/cards/1/move",
        json={"column_id": 2, "position": 0},
        cookies={"session": cookie},
    )
    assert res.status_code == 200
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    backlog = board["columns"][0]
    discovery = board["columns"][1]
    # Backlog lost card 1, remaining card renumbered
    assert len(backlog["cards"]) == 1
    assert backlog["cards"][0]["title"] == "Gather customer signals"
    assert backlog["cards"][0]["position"] == 0
    # Discovery got card 1 at position 0, existing card shifted
    assert len(discovery["cards"]) == 2
    assert discovery["cards"][0]["title"] == "Align roadmap themes"
    assert discovery["cards"][1]["title"] == "Prototype analytics view"


@pytest.mark.asyncio
async def test_move_card_within_column(client: AsyncClient):
    cookie = await auth_cookie(client)
    # Move card 1 (Backlog, pos 0) to position 1 within same column
    res = await client.put(
        "/api/cards/1/move",
        json={"column_id": 1, "position": 1},
        cookies={"session": cookie},
    )
    assert res.status_code == 200
    board = (await client.get("/api/board", cookies={"session": cookie})).json()
    backlog = board["columns"][0]
    assert len(backlog["cards"]) == 2
    assert backlog["cards"][0]["title"] == "Gather customer signals"
    assert backlog["cards"][1]["title"] == "Align roadmap themes"


@pytest.mark.asyncio
async def test_move_card_not_found(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put(
        "/api/cards/999/move",
        json={"column_id": 1, "position": 0},
        cookies={"session": cookie},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_move_card_invalid_target_column(client: AsyncClient):
    cookie = await auth_cookie(client)
    res = await client.put(
        "/api/cards/1/move",
        json={"column_id": 999, "position": 0},
        cookies={"session": cookie},
    )
    assert res.status_code == 404


# -- DB auto-creation --

@pytest.mark.asyncio
async def test_db_auto_creates(client: AsyncClient, tmp_path):
    """init_db is already called by conftest; verify board exists."""
    cookie = await auth_cookie(client)
    res = await client.get("/api/board", cookies={"session": cookie})
    assert res.status_code == 200
    assert res.json()["name"] == "My Board"
