import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.auth import router as auth_router
from .routers.devices import router as devices_router
from .routers.ipam import router as ipam_router
from .routers.users import router as users_router
from .routers.ipam import router as ipam_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    from .bootstrap import initialize_database

    await initialize_database()
    yield


app = FastAPI(title="NetInventory API", version="1.0.0", lifespan=lifespan)

origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(devices_router)
app.include_router(ipam_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "netinventory-api"}


@app.get("/")
async def home():
    return {
        "status": "ok",
        "message": "API de NetInventory funcionando correctamente",
        "version": "1.0.0",
    }