from fastapi import APIRouter, HTTPException, status
from app.schemas.activo import ActivoCreate

router = APIRouter(prefix="/api/v1/activos", tags=["Inventario de Activos"])

# Base de datos temporal en memoria (escala a PostgreSQL en siguientes pasos)
BD_ACTIVOS_SIMULADA = []

@router.get("/")
def listar_activos():
    return {"total": len(BD_ACTIVOS_SIMULADA), "activos": BD_ACTIVOS_SIMULADA}

@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_activo(activo: ActivoCreate):
    # Scrum 4 - HU-05: Validación estricta de IP o MAC duplicadas
    for item in BD_ACTIVOS_SIMULADA:
        if item["ip_gestion"] == activo.ip_gestion:
            raise HTTPException(
                status_code=400, 
                detail=f"La dirección IP '{activo.ip_gestion}' ya se encuentra en uso por otro dispositivo."
            )
        if item["direccion_mac"] == activo.direccion_mac:
            raise HTTPException(
                status_code=400, 
                detail=f"La dirección MAC '{activo.direccion_mac}' ya existe en el inventario."
            )
    
    # Alta exitosa de activo (Scrum 3 - HU-03)
    nuevo_id = len(BD_ACTIVOS_SIMULADA) + 1
    nuevo_activo = activo.dict()
    nuevo_activo["id_dispositivo"] = nuevo_id
    nuevo_activo["estado_operativo"] = "Online"
    
    BD_ACTIVOS_SIMULADA.append(nuevo_activo)
    return {
        "mensaje": "Activo de red registrado exitosamente",
        "activo": nuevo_activo
    }