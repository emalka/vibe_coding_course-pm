import os
import sqlite3

import bcrypt

_db_path: str = os.environ.get("DATABASE_PATH", "/data/kanban.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                name TEXT NOT NULL DEFAULT 'My Board'
            );
            CREATE TABLE IF NOT EXISTS columns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_id INTEGER NOT NULL REFERENCES boards(id),
                title TEXT NOT NULL,
                position INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                column_id INTEGER NOT NULL REFERENCES columns(id),
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL
            );
        """)
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            _seed(conn)
        conn.commit()
    finally:
        conn.close()


def verify_user(username: str, password: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None:
            return False
        return bcrypt.checkpw(password.encode(), row["password_hash"].encode())
    finally:
        conn.close()


def get_board_for_user(username: str) -> dict | None:
    conn = get_connection()
    try:
        user = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            return None

        board = conn.execute(
            "SELECT id, name FROM boards WHERE user_id = ?", (user["id"],)
        ).fetchone()
        if board is None:
            return None

        cols = conn.execute(
            "SELECT id, title, position FROM columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()

        columns = []
        for col in cols:
            cards = conn.execute(
                "SELECT id, title, details, position FROM cards WHERE column_id = ? ORDER BY position",
                (col["id"],),
            ).fetchall()
            columns.append({
                "id": col["id"],
                "title": col["title"],
                "position": col["position"],
                "cards": [dict(c) for c in cards],
            })

        return {"id": board["id"], "name": board["name"], "columns": columns}
    finally:
        conn.close()


def rename_column(column_id: int, title: str, username: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT c.id FROM columns c
            JOIN boards b ON c.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE c.id = ? AND u.username = ?
        """, (column_id, username)).fetchone()
        if row is None:
            return False
        conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
        conn.commit()
        return True
    finally:
        conn.close()


def create_card(column_id: int, title: str, details: str, username: str) -> dict | None:
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT c.id FROM columns c
            JOIN boards b ON c.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE c.id = ? AND u.username = ?
        """, (column_id, username)).fetchone()
        if row is None:
            return None

        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ?",
            (column_id,),
        ).fetchone()[0]

        position = max_pos + 1
        cursor = conn.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (column_id, title, details, position),
        )
        conn.commit()
        return {
            "id": cursor.lastrowid,
            "column_id": column_id,
            "title": title,
            "details": details,
            "position": position,
        }
    finally:
        conn.close()


def update_card(card_id: int, username: str, title: str | None = None, details: str | None = None) -> bool:
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT ca.id FROM cards ca
            JOIN columns co ON ca.column_id = co.id
            JOIN boards b ON co.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE ca.id = ? AND u.username = ?
        """, (card_id, username)).fetchone()
        if row is None:
            return False

        if title is not None:
            conn.execute("UPDATE cards SET title = ? WHERE id = ?", (title, card_id))
        if details is not None:
            conn.execute("UPDATE cards SET details = ? WHERE id = ?", (details, card_id))
        conn.commit()
        return True
    finally:
        conn.close()


def delete_card(card_id: int, username: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT ca.id, ca.column_id, ca.position FROM cards ca
            JOIN columns co ON ca.column_id = co.id
            JOIN boards b ON co.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE ca.id = ? AND u.username = ?
        """, (card_id, username)).fetchone()
        if row is None:
            return False

        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        conn.execute("""
            UPDATE cards SET position = position - 1
            WHERE column_id = ? AND position > ?
        """, (row["column_id"], row["position"]))
        conn.commit()
        return True
    finally:
        conn.close()


def move_card(card_id: int, target_column_id: int, target_position: int, username: str) -> bool:
    conn = get_connection()
    try:
        card = conn.execute("""
            SELECT ca.id, ca.column_id, ca.position FROM cards ca
            JOIN columns co ON ca.column_id = co.id
            JOIN boards b ON co.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE ca.id = ? AND u.username = ?
        """, (card_id, username)).fetchone()
        if card is None:
            return False

        target_col = conn.execute("""
            SELECT c.id FROM columns c
            JOIN boards b ON c.board_id = b.id
            JOIN users u ON b.user_id = u.id
            WHERE c.id = ? AND u.username = ?
        """, (target_column_id, username)).fetchone()
        if target_col is None:
            return False

        source_column_id = card["column_id"]
        source_position = card["position"]

        # Remove from source column (exclude moving card)
        conn.execute("""
            UPDATE cards SET position = position - 1
            WHERE column_id = ? AND position > ? AND id != ?
        """, (source_column_id, source_position, card_id))

        # Make space in target column (exclude moving card)
        conn.execute("""
            UPDATE cards SET position = position + 1
            WHERE column_id = ? AND position >= ? AND id != ?
        """, (target_column_id, target_position, card_id))

        # Place the card
        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (target_column_id, target_position, card_id),
        )

        conn.commit()
        return True
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection):
    pw_hash = bcrypt.hashpw(b"password", bcrypt.gensalt()).decode()
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        ("user", pw_hash),
    )
    conn.execute("INSERT INTO boards (user_id, name) VALUES (1, 'My Board')")

    columns_data = [
        (1, "Backlog", 0),
        (1, "Discovery", 1),
        (1, "In Progress", 2),
        (1, "Review", 3),
        (1, "Done", 4),
    ]
    for board_id, title, position in columns_data:
        conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, position),
        )

    cards_data = [
        (1, "Align roadmap themes", "Draft quarterly themes with impact statements and metrics.", 0),
        (1, "Gather customer signals", "Review support tags, sales notes, and churn feedback.", 1),
        (2, "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.", 0),
        (3, "Refine status language", "Standardize column labels and tone across the board.", 0),
        (3, "Design card layout", "Add hierarchy and spacing for scanning dense lists.", 1),
        (4, "QA micro-interactions", "Verify hover, focus, and loading states.", 0),
        (5, "Ship marketing page", "Final copy approved and asset pack delivered.", 0),
        (5, "Close onboarding sprint", "Document release notes and share internally.", 1),
    ]
    for col_id, title, details, position in cards_data:
        conn.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (col_id, title, details, position),
        )
