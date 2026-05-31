# Database Design

## Overview

SQLite database stored at `/data/kanban.db` inside the Docker container. The `/data` directory is mounted as a Docker volume (`kanban-data`) so data persists across container restarts.

## Schema

### users

| Column        | Type    | Constraints              |
|---------------|---------|--------------------------|
| id            | INTEGER | PRIMARY KEY AUTOINCREMENT|
| username      | TEXT    | NOT NULL UNIQUE          |
| password_hash | TEXT    | NOT NULL                 |

For the MVP, a single user ("user") is seeded on first run. The password_hash stores a bcrypt hash. Multi-user ready for future.

### boards

| Column  | Type    | Constraints                          |
|---------|---------|--------------------------------------|
| id      | INTEGER | PRIMARY KEY AUTOINCREMENT            |
| user_id | INTEGER | NOT NULL, FOREIGN KEY -> users(id)   |
| name    | TEXT    | NOT NULL DEFAULT 'My Board'          |

One board per user for the MVP. Schema supports multiple boards per user for future.

### columns

| Column   | Type    | Constraints                          |
|----------|---------|--------------------------------------|
| id       | INTEGER | PRIMARY KEY AUTOINCREMENT            |
| board_id | INTEGER | NOT NULL, FOREIGN KEY -> boards(id)  |
| title    | TEXT    | NOT NULL                             |
| position | INTEGER | NOT NULL                             |

Position is a zero-based integer for ordering. When reordering, positions are renumbered.

### cards

| Column    | Type    | Constraints                           |
|-----------|---------|---------------------------------------|
| id        | INTEGER | PRIMARY KEY AUTOINCREMENT             |
| column_id | INTEGER | NOT NULL, FOREIGN KEY -> columns(id)  |
| title     | TEXT    | NOT NULL                              |
| details   | TEXT    | NOT NULL DEFAULT ''                   |
| position  | INTEGER | NOT NULL                              |

Position is a zero-based integer within the column. When moving or reordering cards, positions are renumbered within affected columns.

## Relationships

```
users 1 --- * boards
boards 1 --- * columns
columns 1 --- * cards
```

## Default Seed Data

On first run (empty database), the app creates:
- 1 user: username="user", password hashed via bcrypt
- 1 board: "My Board" for that user
- 5 columns: Backlog (0), Discovery (1), In Progress (2), Review (3), Done (4)
- 8 sample cards distributed across the columns (matching the current frontend demo data)

## SQLite Configuration

- WAL mode enabled for better concurrent read performance
- Foreign keys enforced (`PRAGMA foreign_keys = ON`)
- File location: `/data/kanban.db`
- Docker volume: `kanban-data` mounted at `/data`
