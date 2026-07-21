import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.v1.endpoints import router as v1_router
from app.infrastructure.db.postgres import init_db

app = FastAPI(
    title="SearchPick.ai Core Engine",
    description="Production-ready AI Commerce Operating System backend",
    version="1.0.0"
)

# Initialize database schemas
init_db()

# Enable CORS for Next.js frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")

# Mount statically built frontend if directory exists
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "out"))

if os.path.exists(frontend_path):
    # Mount SPA static resources (assets, _next, etc.)
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    @app.get("/")
    def read_root():
        return {"message": "Welcome to SearchPick.ai API Engine (Frontend static export out/ not found)"}


