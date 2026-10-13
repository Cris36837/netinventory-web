from fastapi import FastAPI

from app.database import Base, engine
from app.models.usuario import Usuario
from app.models.activo import Activo

from app.routers.activos import router as activos_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(activos_router)

@app.get("/")
def inicio():
    return {
        "proyecto": "NetInventory",
        "estado": "funcionando"
    }