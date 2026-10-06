"""
Subversion Nuvi - Main Application Server Entrypoint
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.api.config import config
from backend.api.db import init_db
from backend.api.routers import repositories, server, users, groups, acl, shield, auth, browser, search, audit, operations, certificates, directory

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist
    init_db()
    yield
    # Shutdown logic if any

app = FastAPI(
    title="Subversion Nuvi API",
    description="Enterprise Management & Service API for Apache Subversion",
    version="1.16.1",
    lifespan=lifespan,
    docs_url=f"{config.API_URL_PREFIX}/docs",
    openapi_url=f"{config.API_URL_PREFIX}/openapi.json",
)

# CORS configuration for Web Admin & Web Client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(repositories.router, prefix=config.API_URL_PREFIX)
app.include_router(server.router, prefix=config.API_URL_PREFIX)
app.include_router(users.router, prefix=config.API_URL_PREFIX)
app.include_router(groups.router, prefix=config.API_URL_PREFIX)
app.include_router(acl.router, prefix=config.API_URL_PREFIX)
app.include_router(shield.router, prefix=config.API_URL_PREFIX)
app.include_router(auth.router, prefix=config.API_URL_PREFIX)
app.include_router(browser.router, prefix=config.API_URL_PREFIX)
app.include_router(search.router, prefix=config.API_URL_PREFIX)
app.include_router(audit.router, prefix=config.API_URL_PREFIX)
app.include_router(operations.router, prefix=config.API_URL_PREFIX)
app.include_router(certificates.router, prefix=config.API_URL_PREFIX)
app.include_router(directory.router, prefix=config.API_URL_PREFIX)

@app.get("/health", tags=["Health"])
def health_check():
    """Liveness probe for containers and monitoring."""
    return {"status": "healthy", "server": config.SERVER_NAME}

# Mount static frontend directory if built
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
