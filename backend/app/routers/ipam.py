import ipaddress
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..database import get_db
from ..models import Subred, DireccionIP, Usuario
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/ipam", tags=["Módulo IPAM"])
editor_required = require_roles("Admin", "Técnico")

@router.post("/subredes", status_code=status.HTTP_201_CREATED)
async def crear_subred(
    body: dict, 
    _: Annotated[Usuario, Depends(editor_required)],
    db: AsyncSession = Depends(get_db),
):
    """
    Define un nuevo segmento de subred CIDR y lo guarda en la base de datos.
    """
    cidr_str = body.get("cidr")
    nombre_segmento = body.get("nombre_segmento", "Segmento de red")
    descripcion = body.get("descripcion")
    etiqueta_vlan = body.get("etiqueta_vlan", 100)

    if not cidr_str:
        raise HTTPException(status_code=422, detail="El campo CIDR es obligatorio")
    
    try:
        network = ipaddress.ip_network(cidr_str, strict=False)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Formato CIDR inválido: {str(e)}")

    # Guardar en la base de datos incluyendo el campo cidr
    nueva_subred = Subred(
        etiqueta_vlan=etiqueta_vlan,
        cidr=str(network),
        nombre_segmento=nombre_segmento,
        descripcion=descripcion
    )
    db.add(nueva_subred)
    await db.commit()
    await db.refresh(nueva_subred)

    return {
        "mensaje": "Subred registrada exitosamente",
        "id_vlan": nueva_subred.id_vlan,
        "red": str(network),
        "mascara": str(network.netmask),
        "total_ips": network.num_addresses
    }

@router.get("/subredes/{id}/matriz")
async def obtener_matriz_ipam(
    id: int,
    _: Annotated[Usuario, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Subred).where(Subred.id_vlan == id))
    subred = result.scalars().first()
    if not subred:
        raise HTTPException(status_code=404, detail="Subred no encontrada")
    
    # Generar IPs basadas en el CIDR de la subred guardada
    network = ipaddress.ip_network(subred.cidr, strict=False)
    ips_resultado = []
    for ip in network.hosts():
        ips_resultado.append({
            "direccion": str(ip),
            "estado": "libre",
            "proposito": "disponible"
        })
        
    return {
        "subred_id": id,
        "ips": ips_resultado
    }