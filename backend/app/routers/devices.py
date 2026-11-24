import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models import BastidorRack, DireccionIP, Dispositivo, TipoDispositivo, Usuario
from ..schemas import DeviceCreate, DeviceResponse, DeviceTypeResponse, DeviceUpdate
from .audit import record_audit
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1", tags=["Activos de red"])
editor_required = require_roles("Admin", "Técnico")
admin_required = require_roles("Admin")
DEVICE_IMPORT_FIELDS = {
    "id_tipo",
    "id_rack",
    "nombre_host",
    "fqdn",
    "numero_serie",
    "ip_gestion",
    "mac_address",
    "ru_inicio",
    "estado_operativo",
}
DEVICE_IMPORT_REQUIRED_FIELDS = {"id_tipo", "nombre_host"}
DEVICE_IMPORT_UNIQUE_FIELDS = (
    "nombre_host",
    "fqdn",
    "numero_serie",
    "ip_gestion",
    "mac_address",
)
MAX_DEVICE_IMPORT_BYTES = 2 * 1024 * 1024
MAX_DEVICE_IMPORT_ROWS = 1000
MAX_DEVICE_IMPORT_REPORT_ROWS = 100


def parse_device_csv(content: bytes) -> tuple[list[dict], list[dict]]:
    if len(content) > MAX_DEVICE_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="El archivo CSV no puede superar 2 MB")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="El archivo debe estar codificado como UTF-8",
        ) from exc

    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = next(reader, None)
        if not headers:
            raise HTTPException(status_code=422, detail="El archivo CSV está vacío")
        headers = [header.strip() for header in headers]
        if len(set(headers)) != len(headers):
            raise HTTPException(status_code=422, detail="El CSV contiene encabezados repetidos")
        missing = DEVICE_IMPORT_REQUIRED_FIELDS - set(headers)
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Faltan columnas obligatorias: {', '.join(sorted(missing))}",
            )
        unknown = set(headers) - DEVICE_IMPORT_FIELDS
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"Columnas no reconocidas: {', '.join(sorted(unknown))}",
            )

        parsed_rows = []
        invalid_rows = []
        for values in reader:
            line = reader.line_num
            if not values or all(not value.strip() for value in values):
                continue
            if len(parsed_rows) + len(invalid_rows) >= MAX_DEVICE_IMPORT_ROWS:
                raise HTTPException(
                    status_code=413,
                    detail=f"El archivo no puede superar {MAX_DEVICE_IMPORT_ROWS} filas",
                )
            if len(values) != len(headers):
                invalid_rows.append({
                    "line": line,
                    "kind": "invalid",
                    "messages": ["La fila no coincide con la cantidad de columnas del encabezado"],
                })
                continue

            raw_device = {
                key: value.strip()
                for key, value in zip(headers, values)
                if value.strip()
            }
            try:
                device = DeviceCreate.model_validate(raw_device)
            except ValidationError as exc:
                messages = [
                    f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
                    for error in exc.errors()
                ]
                invalid_rows.append({
                    "line": line,
                    "kind": "invalid",
                    "messages": messages,
                })
                continue
            parsed_rows.append({"line": line, "device": device.model_dump()})
    except csv.Error as exc:
        raise HTTPException(status_code=422, detail="El archivo contiene CSV mal formado") from exc

    if not parsed_rows and not invalid_rows:
        raise HTTPException(status_code=422, detail="El CSV no contiene filas de datos")
    return parsed_rows, invalid_rows


async def analyze_device_csv(db: AsyncSession, content: bytes) -> dict:
    parsed_rows, invalid_rows = parse_device_csv(content)
    type_result = await db.execute(select(TipoDispositivo.id_tipo))
    rack_result = await db.execute(select(BastidorRack.id_rack))
    valid_type_ids = set(type_result.scalars())
    valid_rack_ids = set(rack_result.scalars())

    existing_result = await db.execute(
        select(
            Dispositivo.nombre_host,
            Dispositivo.fqdn,
            Dispositivo.numero_serie,
            Dispositivo.ip_gestion,
            Dispositivo.mac_address,
        )
    )
    unique_values = {field: set() for field in DEVICE_IMPORT_UNIQUE_FIELDS}
    for existing in existing_result.all():
        for field in DEVICE_IMPORT_UNIQUE_FIELDS:
            value = getattr(existing, field)
            if value is not None:
                unique_values[field].add(value)

    reserved_ip_result = await db.execute(
        select(DireccionIP.direccion).where(DireccionIP.estado_asignacion == "reservada")
    )
    reserved_ips = set(reserved_ip_result.scalars())

    valid_rows = []
    duplicate_rows = []
    for row in parsed_rows:
        device = row["device"]
        missing_references = []
        if device["id_tipo"] not in valid_type_ids:
            missing_references.append("id_tipo no existe")
        if device["id_rack"] is not None and device["id_rack"] not in valid_rack_ids:
            missing_references.append("id_rack no existe")
        if device["ip_gestion"] in reserved_ips:
            missing_references.append("ip_gestion está reservada en IPAM")
        if missing_references:
            invalid_rows.append({
                "line": row["line"],
                "kind": "invalid",
                "messages": missing_references,
            })
            continue

        duplicate_fields = [
            field
            for field in DEVICE_IMPORT_UNIQUE_FIELDS
            if device[field] is not None and device[field] in unique_values[field]
        ]
        if duplicate_fields:
            duplicate_rows.append({
                "line": row["line"],
                "kind": "duplicate",
                "nombre_host": device["nombre_host"],
                "fields": duplicate_fields,
            })
            continue

        for field in DEVICE_IMPORT_UNIQUE_FIELDS:
            if device[field] is not None:
                unique_values[field].add(device[field])
        valid_rows.append(row)

    issues = invalid_rows + duplicate_rows
    active_count = sum(
        row["device"]["estado_operativo"] == "activo"
        for row in valid_rows
    )
    return {
        "valid_rows": valid_rows,
        "valid_count": len(valid_rows),
        "duplicate_count": len(duplicate_rows),
        "invalid_count": len(invalid_rows),
        "active_count": active_count,
        "issues": issues[:MAX_DEVICE_IMPORT_REPORT_ROWS],
        "report_truncated": len(issues) > MAX_DEVICE_IMPORT_REPORT_ROWS,
    }


def serialize_device_import_report(analysis: dict) -> dict:
    return {
        "valid_count": analysis["valid_count"],
        "duplicate_count": analysis["duplicate_count"],
        "invalid_count": analysis["invalid_count"],
        "active_count": analysis["active_count"],
        "preview": [
            {
                "line": row["line"],
                "nombre_host": row["device"]["nombre_host"],
                "ip_gestion": row["device"]["ip_gestion"],
                "estado_operativo": row["device"]["estado_operativo"],
            }
            for row in analysis["valid_rows"][:10]
        ],
        "issues": analysis["issues"],
        "report_truncated": analysis["report_truncated"],
    }


def serialize_device(device: Dispositivo) -> DeviceResponse:
    return DeviceResponse(
        id_dispositivo=device.id_dispositivo,
        id_tipo=device.id_tipo,
        categoria=device.tipo.categoria,
        fabricante=device.tipo.fabricante,
        modelo=device.tipo.modelo,
        id_rack=device.id_rack,
        nombre_host=device.nombre_host,
        fqdn=device.fqdn,
        numero_serie=device.numero_serie,
        ip_gestion=device.ip_gestion,
        mac_address=device.mac_address,
        ru_inicio=device.ru_inicio,
        estado_operativo=device.estado_operativo,
    )


async def ensure_references(
    db: AsyncSession,
    id_tipo: int | None,
    id_rack: int | None,
) -> None:
    if id_tipo is not None and await db.get(TipoDispositivo, id_tipo) is None:
        raise HTTPException(status_code=422, detail="El tipo de dispositivo no existe")
    if id_rack is not None and await db.get(BastidorRack, id_rack) is None:
        raise HTTPException(status_code=422, detail="El rack seleccionado no existe")


@router.get("/device-types", response_model=list[DeviceTypeResponse])
async def list_device_types(
    _: Annotated[Usuario, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TipoDispositivo).order_by(TipoDispositivo.categoria, TipoDispositivo.fabricante)
    )
    return result.scalars().all()


@router.get("/racks")
async def list_racks(
    _: Annotated[Usuario, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BastidorRack).order_by(BastidorRack.identificador)
    )
    return [
        {"id_rack": rack.id_rack, "identificador": rack.identificador}
        for rack in result.scalars()
    ]


@router.get("/devices", response_model=list[DeviceResponse])
async def list_devices(
    _: Annotated[Usuario, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(default=None, max_length=120),
):
    query = select(Dispositivo).options(selectinload(Dispositivo.tipo)).order_by(Dispositivo.nombre_host)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            Dispositivo.nombre_host.ilike(term)
            | Dispositivo.ip_gestion.ilike(term)
            | Dispositivo.numero_serie.ilike(term)
        )
    result = await db.execute(query)
    return [serialize_device(device) for device in result.scalars()]


@router.post("/devices/import/preview")
async def preview_device_import(
    _: Annotated[Usuario, Depends(editor_required)],
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Selecciona un archivo con extensión .csv")
    content = await file.read(MAX_DEVICE_IMPORT_BYTES + 1)
    analysis = await analyze_device_csv(db, content)
    return serialize_device_import_report(analysis)


@router.post("/devices/import")
async def import_devices(
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Selecciona un archivo con extensión .csv")
    content = await file.read(MAX_DEVICE_IMPORT_BYTES + 1)
    analysis = await analyze_device_csv(db, content)
    devices_to_create = [Dispositivo(**row["device"]) for row in analysis["valid_rows"]]
    if devices_to_create:
        db.add_all(devices_to_create)
        await record_audit(
            db,
            user,
            "devices.bulk_imported",
            (
                f"Importación CSV: {len(devices_to_create)} activos; "
                f"{analysis['duplicate_count']} duplicados; "
                f"{analysis['invalid_count']} filas inválidas"
            ),
            request,
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Los datos cambiaron durante la importación; vuelve a generar la vista previa",
            ) from exc
    return {
        **serialize_device_import_report(analysis),
        "imported_count": len(devices_to_create),
    }


@router.post("/devices", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: AsyncSession = Depends(get_db),
):
    await ensure_references(db, body.id_tipo, body.id_rack)
    if body.ip_gestion:
        reserved = await db.scalar(
            select(DireccionIP.id_ip).where(
                DireccionIP.direccion == body.ip_gestion,
                DireccionIP.estado_asignacion == "reservada",
            )
        )
        if reserved is not None:
            raise HTTPException(status_code=409, detail="La IP ya está reservada en IPAM")
    device = Dispositivo(**body.model_dump())
    db.add(device)
    try:
        await db.flush()
        await record_audit(
            db, user, "device.created", f"Activo '{device.nombre_host}' registrado", request,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El nombre de host, FQDN, número de serie, IP o MAC ya está registrado",
        ) from exc

    result = await db.execute(
        select(Dispositivo)
        .options(selectinload(Dispositivo.tipo))
        .where(Dispositivo.id_dispositivo == device.id_dispositivo)
    )
    return serialize_device(result.scalar_one())


@router.get("/devices/{device_id}", response_model=DeviceResponse)
async def get_device(
    device_id: int,
    _: Annotated[Usuario, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dispositivo)
        .options(selectinload(Dispositivo.tipo))
        .where(Dispositivo.id_dispositivo == device_id)
    )
    device = result.scalars().first()
    if device is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    return serialize_device(device)


@router.patch("/devices/{device_id}", response_model=DeviceResponse)
async def update_device(
    device_id: int,
    body: DeviceUpdate,
    request: Request,
    user: Annotated[Usuario, Depends(editor_required)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dispositivo)
        .options(selectinload(Dispositivo.tipo))
        .where(Dispositivo.id_dispositivo == device_id)
    )
    device = result.scalars().first()
    if device is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    changes = body.model_dump(exclude_unset=True)
    for required in ("id_tipo", "nombre_host", "estado_operativo"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"El campo {required} no puede ser nulo")
    await ensure_references(
        db,
        changes.get("id_tipo", device.id_tipo),
        changes.get("id_rack", device.id_rack),
    )
    ip_gestion = changes.get("ip_gestion", device.ip_gestion)
    if ip_gestion:
        reserved = await db.scalar(
            select(DireccionIP.id_ip).where(
                DireccionIP.direccion == ip_gestion,
                DireccionIP.estado_asignacion == "reservada",
            )
        )
        if reserved is not None:
            raise HTTPException(status_code=409, detail="La IP ya está reservada en IPAM")
    for field, value in changes.items():
        setattr(device, field, value)

    await record_audit(
        db,
        user,
        "device.updated",
        f"Activo '{device.nombre_host}' actualizado; campos: {', '.join(changes.keys())}",
        request,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El nombre de host, FQDN, número de serie, IP o MAC ya está registrado",
        ) from exc

    result = await db.execute(
        select(Dispositivo)
        .options(selectinload(Dispositivo.tipo))
        .where(Dispositivo.id_dispositivo == device_id)
    )
    return serialize_device(result.scalar_one())


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    request: Request,
    user: Annotated[Usuario, Depends(admin_required)],
    db: AsyncSession = Depends(get_db),
):
    device = await db.get(Dispositivo, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    await record_audit(
        db, user, "device.deleted", f"Activo '{device.nombre_host}' eliminado", request,
    )
    await db.delete(device)
    await db.commit()
