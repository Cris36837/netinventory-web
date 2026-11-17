import ipaddress
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import (
    Dispositivo,
    SandboxSimulation,
    SandboxTemplate,
    Usuario,
)
from ..schemas import SandboxSimulationCreate, SandboxTemplateCreate, SandboxTemplateGenerate
from .audit import record_audit
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/sandbox", tags=["Sandbox de configuración"])
editor_required = require_roles("Admin", "Técnico")


def template_response(template: SandboxTemplate) -> dict:
    return {
        "id_plantilla": template.id_plantilla,
        "nombre": template.nombre,
        "descripcion": template.descripcion,
        "fabricante": template.fabricante,
        "configuracion": template.configuracion,
        "fecha_creacion": template.fecha_creacion,
    }


def simulation_response(simulation: SandboxSimulation) -> dict:
    return {
        "id_simulacion": simulation.id_simulacion,
        "tipo_objetivo": simulation.tipo_objetivo,
        "nombre_objetivo": simulation.nombre_objetivo,
        "id_plantilla": simulation.id_plantilla,
        "configuracion_base": simulation.configuracion_base,
        "cambios": simulation.cambios,
        "diferencias": simulation.diferencias,
        "validaciones": simulation.validaciones,
        "fecha_creacion": simulation.fecha_creacion,
    }


@router.get("/templates")
async def list_templates(
    _: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(SandboxTemplate).order_by(SandboxTemplate.fecha_creacion.desc())
    )
    return [template_response(template) for template in result.scalars()]


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    body: SandboxTemplateCreate,
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    template = SandboxTemplate(
        **body.model_dump(),
        id_usuario=user.id_usuario,
    )
    db.add(template)
    await db.flush()
    await record_audit(
        db, user, "sandbox.template.created",
        f"Plantilla '{template.nombre}' creada (ID {template.id_plantilla})", request,
    )
    await db.commit()
    await db.refresh(template)
    return template_response(template)


@router.post("/templates/generate", status_code=status.HTTP_201_CREATED)
async def generate_template(
    body: SandboxTemplateGenerate,
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    config = {
        "hostname": "nuevo-dispositivo",
        "management_ip": "192.0.2.10",
        "vlan": 10,
        "admin_state": "enabled",
    }
    manufacturer = "Genérico"
    description = "Plantilla inicial generada para simulación; no aplicada a ningún equipo."
    if body.id_dispositivo:
        result = await db.execute(
            select(Dispositivo)
            .options(selectinload(Dispositivo.tipo))
            .where(Dispositivo.id_dispositivo == body.id_dispositivo)
        )
        device = result.scalars().first()
        if device is None:
            raise HTTPException(status_code=404, detail="Dispositivo de referencia no encontrado")
        manufacturer = device.tipo.fabricante
        config = {
            "hostname": device.nombre_host,
            "management_ip": device.ip_gestion or "192.0.2.10",
            "device_category": device.tipo.categoria,
            "device_model": device.tipo.modelo,
            "admin_state": "enabled" if device.estado_operativo == "activo" else "disabled",
            "vlan": 10,
        }
        description = f"Plantilla generada desde el activo {device.nombre_host}."

    template = SandboxTemplate(
        nombre=body.nombre or f"Plantilla {manufacturer} - sandbox",
        descripcion=description,
        fabricante=manufacturer,
        configuracion=config,
        id_usuario=user.id_usuario,
    )
    db.add(template)
    await db.flush()
    await record_audit(
        db, user, "sandbox.template.generated",
        f"Plantilla '{template.nombre}' generada (ID {template.id_plantilla})", request,
    )
    await db.commit()
    await db.refresh(template)
    return template_response(template)


def validate_configuration(config: dict) -> list[dict]:
    checks = []
    hostname = config.get("hostname")
    if hostname is not None:
        valid = (
            isinstance(hostname, str)
            and len(hostname) <= 253
            and all(
                bool(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label))
                for label in hostname.split(".")
            )
        )
        checks.append({
            "campo": "hostname",
            "estado": "ok" if valid else "error",
            "mensaje": "Nombre de host válido" if valid else "Debe ser un hostname válido.",
        })

    management_ip = config.get("management_ip")
    if management_ip is not None:
        try:
            ipaddress.ip_address(str(management_ip))
            valid = True
        except ValueError:
            valid = False
        checks.append({
            "campo": "management_ip",
            "estado": "ok" if valid else "error",
            "mensaje": "Dirección IP válida" if valid else "La IP de gestión no es válida.",
        })

    for field in ("vlan", "management_vlan"):
        value = config.get(field)
        if value is not None:
            valid = isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 4094
            checks.append({
                "campo": field,
                "estado": "ok" if valid else "error",
                "mensaje": "VLAN dentro del rango 1–4094" if valid else "La VLAN debe ser un entero entre 1 y 4094.",
            })

    if not checks:
        checks.append({
            "campo": "configuracion",
            "estado": "warning",
            "mensaje": "No se encontraron parámetros con reglas específicas; revisa la configuración manualmente.",
        })
    return checks


@router.post("/simulations", status_code=status.HTTP_201_CREATED)
async def simulate_configuration(
    body: SandboxSimulationCreate,
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    base = body.configuracion_base or {}
    if body.id_plantilla is not None:
        template = await db.get(SandboxTemplate, body.id_plantilla)
        if template is None:
            raise HTTPException(status_code=404, detail="Plantilla no encontrada")
        if body.configuracion_base is not None:
            raise HTTPException(
                status_code=422,
                detail="Usa una plantilla o una configuración base explícita, no ambas",
            )
        base = dict(template.configuracion)
    if not base:
        raise HTTPException(
            status_code=422,
            detail="Selecciona una plantilla o proporciona una configuración base",
        )

    changes = body.cambios
    result_config = {**base, **changes}
    differences = [
        {
            "campo": field,
            "valor_anterior": base.get(field),
            "valor_nuevo": value,
            "tipo": "modificado" if field in base else "agregado",
        }
        for field, value in changes.items()
        if base.get(field) != value or field not in base
    ]
    for field, value in base.items():
        if field not in changes:
            differences.append({
                "campo": field,
                "valor_anterior": value,
                "valor_nuevo": value,
                "tipo": "sin_cambios",
            })

    validations = validate_configuration(result_config)
    simulation = SandboxSimulation(
        id_usuario=user.id_usuario,
        tipo_objetivo=body.tipo_objetivo,
        nombre_objetivo=body.nombre_objetivo,
        id_plantilla=body.id_plantilla,
        configuracion_base=base,
        cambios=changes,
        diferencias=differences,
        validaciones=validations,
    )
    db.add(simulation)
    await db.flush()
    await record_audit(
        db, user, "sandbox.simulation.executed",
        f"Simulación {simulation.id_simulacion} sobre {body.tipo_objetivo} '{body.nombre_objetivo}'",
        request,
    )
    await db.commit()
    await db.refresh(simulation)
    return simulation_response(simulation)


@router.get("/simulations")
async def list_simulations(
    _: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(SandboxSimulation)
        .order_by(SandboxSimulation.fecha_creacion.desc())
        .limit(100)
    )
    return [simulation_response(simulation) for simulation in result.scalars()]
