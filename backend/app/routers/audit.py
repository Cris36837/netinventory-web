import csv
import io
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import AuditLog, Usuario
from .auth import require_roles

router = APIRouter(prefix="/api/v1/audit-logs", tags=["Auditoría"])
auditor_access = require_roles("Admin", "Auditor")


def build_audit_query(
    action: str | None,
    actor: str | None,
    start: datetime | None,
    end: datetime | None,
):
    if start and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end and end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="La fecha 'desde' debe ser anterior a 'hasta'")
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.accion.ilike(f"%{action.strip()}%"))
    if actor:
        query = query.join(AuditLog.usuario).where(
            or_(
                Usuario.nombre_usuario.ilike(f"%{actor.strip()}%"),
                Usuario.correo.ilike(f"%{actor.strip()}%"),
            )
        )
    if start:
        query = query.where(AuditLog.fecha_creacion >= start)
    if end:
        query = query.where(AuditLog.fecha_creacion <= end)
    return query


def serialize_log(log: AuditLog) -> dict:
    return {
        "id_auditoria": log.id_auditoria,
        "id_usuario": str(log.id_usuario) if log.id_usuario else None,
        "usuario": log.usuario.nombre_usuario if log.usuario else "Usuario eliminado",
        "accion": log.accion,
        "detalles": log.detalles,
        "ip_origen": log.ip_origen,
        "fecha_creacion": log.fecha_creacion,
    }


def safe_csv_value(value: str | int) -> str | int:
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


@router.get("")
async def obtener_registros_auditoria(
    _: Annotated[Usuario, Depends(auditor_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
    accion: str | None = Query(default=None, max_length=100),
    usuario: str | None = Query(default=None, max_length=150),
    desde: datetime | None = None,
    hasta: datetime | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    filters = build_audit_query(accion, usuario, desde, hasta)
    total = await db.scalar(select(func.count()).select_from(filters.subquery()))
    result = await db.execute(
        filters.options(selectinload(AuditLog.usuario))
        .order_by(AuditLog.fecha_creacion.desc(), AuditLog.id_auditoria.desc())
        .offset(offset)
        .limit(limit)
    )
    return {"items": [serialize_log(log) for log in result.scalars()], "total": total or 0}


@router.get("/export")
async def exportar_registros_auditoria(
    _: Annotated[Usuario, Depends(auditor_access)],
    db: Annotated[AsyncSession, Depends(get_db)],
    accion: str | None = Query(default=None, max_length=100),
    usuario: str | None = Query(default=None, max_length=150),
    desde: datetime | None = None,
    hasta: datetime | None = None,
):
    filters = build_audit_query(accion, usuario, desde, hasta)
    result = await db.execute(
        filters.options(selectinload(AuditLog.usuario))
        .order_by(AuditLog.fecha_creacion.desc(), AuditLog.id_auditoria.desc())
        .limit(10000)
    )
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["ID", "Fecha", "Usuario", "Acción", "Detalles", "IP de origen"])
    for log in result.scalars():
        values = [
            log.id_auditoria,
            log.fecha_creacion.isoformat() if log.fecha_creacion else "",
            log.usuario.nombre_usuario if log.usuario else "Usuario eliminado",
            log.accion,
            log.detalles or "",
            log.ip_origen or "",
        ]
        writer.writerow([safe_csv_value(value) for value in values])
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="bitacora-auditoria.csv"'},
    )


async def record_audit(
    db: AsyncSession,
    user: Usuario,
    action: str,
    details: str,
    request: Request,
) -> None:
    db.add(
        AuditLog(
            id_usuario=user.id_usuario,
            accion=action,
            detalles=details,
            ip_origen=request.client.host if request.client else None,
        )
    )
