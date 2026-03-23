from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="Kanban Studio API")

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve static frontend - must be after API routes
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
