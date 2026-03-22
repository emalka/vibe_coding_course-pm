from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="Kanban Studio API")


@app.get("/", response_class=HTMLResponse)
async def root():
    return """<!DOCTYPE html>
<html>
<head><title>Kanban Studio</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f7f8fb;">
  <div style="text-align: center;">
    <h1 style="color: #032147;">Kanban Studio</h1>
    <p style="color: #888888;">Backend is running.</p>
  </div>
</body>
</html>"""


@app.get("/api/health")
async def health():
    return {"status": "ok"}
