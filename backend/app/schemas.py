import ipaddress
import re
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, JsonValue, field_validator


DeviceState = Literal["activo", "mantenimiento", "inactivo"]


class UserCreate(BaseModel):
    nombre_usuario: str = Field(min_length=2, max_length=100)
    correo: EmailStr
    password: str = Field(min_length=8, max_length=72)
    id_rol: int

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("La contraseña no puede superar 72 bytes UTF-8")
        return value


class UserUpdate(BaseModel):
    nombre_usuario: str | None = Field(default=None, min_length=2, max_length=100)
    correo: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=72)
    id_rol: int | None = None
    activo: bool | None = None

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str | None) -> str | None:
        if value is not None and len(value.encode("utf-8")) > 72:
            raise ValueError("La contraseña no puede superar 72 bytes UTF-8")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id_usuario: str
    nombre_usuario: str
    correo: EmailStr
    id_rol: int
    rol: str
    activo: bool
    ultimo_acceso: str | None


class DeviceCreate(BaseModel):
    id_tipo: int
    id_rack: int | None = None
    nombre_host: str = Field(min_length=1, max_length=120)
    fqdn: str | None = Field(default=None, max_length=253)
    numero_serie: str | None = Field(default=None, max_length=120)
    ip_gestion: str | None = Field(default=None, max_length=45)
    mac_address: str | None = Field(default=None, max_length=17)
    ru_inicio: int | None = Field(default=None, ge=1, le=100)
    estado_operativo: DeviceState = "activo"

    @field_validator("ip_gestion")
    @classmethod
    def validate_management_ip(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            return str(ipaddress.ip_address(value.strip()))
        except ValueError as exc:
            raise ValueError("La IP de gestión no es válida") from exc

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().replace("-", ":").upper()
        if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", normalized):
            raise ValueError("La dirección MAC debe tener el formato AA:BB:CC:DD:EE:FF")
        return normalized


class DeviceUpdate(BaseModel):
    id_tipo: int | None = None
    id_rack: int | None = None
    nombre_host: str | None = Field(default=None, min_length=1, max_length=120)
    fqdn: str | None = Field(default=None, max_length=253)
    numero_serie: str | None = Field(default=None, max_length=120)
    ip_gestion: str | None = Field(default=None, max_length=45)
    mac_address: str | None = Field(default=None, max_length=17)
    ru_inicio: int | None = Field(default=None, ge=1, le=100)
    estado_operativo: DeviceState | None = None

    @field_validator("ip_gestion")
    @classmethod
    def validate_management_ip(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            return str(ipaddress.ip_address(value.strip()))
        except ValueError as exc:
            raise ValueError("La IP de gestión no es válida") from exc

    @field_validator("mac_address")
    @classmethod
    def validate_mac_address(cls, value: str | None) -> str | None:
        return DeviceCreate.validate_mac_address(value)


class DeviceTypeResponse(BaseModel):
    id_tipo: int
    categoria: str
    fabricante: str
    modelo: str
    altura_ru: int | None


class DeviceResponse(BaseModel):
    id_dispositivo: int
    id_tipo: int
    categoria: str
    fabricante: str
    modelo: str
    id_rack: int | None
    nombre_host: str
    fqdn: str | None
    numero_serie: str | None
    ip_gestion: str | None
    mac_address: str | None
    ru_inicio: int | None
    estado_operativo: str


class SubnetCreate(BaseModel):
    cidr: str = Field(min_length=3, max_length=43)
    etiqueta_vlan: int = Field(ge=1, le=4094)
    nombre_segmento: str = Field(min_length=1, max_length=100)
    descripcion: str | None = Field(default=None, max_length=1000)

    @field_validator("cidr")
    @classmethod
    def validate_cidr(cls, value: str) -> str:
        try:
            return str(ipaddress.ip_network(value.strip(), strict=False))
        except ValueError as exc:
            raise ValueError("El segmento debe ser una red CIDR válida") from exc


class IPReservationCreate(BaseModel):
    direccion: str = Field(min_length=3, max_length=45)
    proposito: str | None = Field(default=None, max_length=100)

    @field_validator("direccion")
    @classmethod
    def validate_address(cls, value: str) -> str:
        try:
            return str(ipaddress.ip_address(value.strip()))
        except ValueError as exc:
            raise ValueError("La dirección IP no es válida") from exc


SandboxConfig = dict[str, JsonValue]


def validate_sandbox_config(value: SandboxConfig) -> SandboxConfig:
    if not value:
        raise ValueError("La configuración debe contener al menos un parámetro")
    if len(value) > 100:
        raise ValueError("La configuración no puede superar 100 parámetros")
    if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")) > 32768:
        raise ValueError("La configuración no puede superar 32 KB")
    return value


class SandboxTemplateCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    descripcion: str | None = Field(default=None, max_length=500)
    fabricante: str | None = Field(default=None, max_length=100)
    configuracion: SandboxConfig

    @field_validator("nombre")
    @classmethod
    def normalize_template_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("El nombre de la plantilla debe tener al menos 2 caracteres")
        return normalized

    @field_validator("configuracion")
    @classmethod
    def validate_config(cls, value: SandboxConfig) -> SandboxConfig:
        return validate_sandbox_config(value)


class SandboxSimulationCreate(BaseModel):
    tipo_objetivo: Literal["container", "virtual_appliance"]
    nombre_objetivo: str = Field(min_length=1, max_length=120)
    id_plantilla: int | None = Field(default=None, ge=1)
    configuracion_base: SandboxConfig | None = None
    cambios: SandboxConfig

    @field_validator("nombre_objetivo")
    @classmethod
    def normalize_target_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("El nombre del objetivo no puede estar vacío")
        return normalized

    @field_validator("configuracion_base", "cambios")
    @classmethod
    def validate_config(cls, value: SandboxConfig | None) -> SandboxConfig | None:
        return validate_sandbox_config(value) if value is not None else None


class SandboxTemplateGenerate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    id_dispositivo: int | None = Field(default=None, ge=1)

    @field_validator("nombre")
    @classmethod
    def normalize_template_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("El nombre de la plantilla debe tener al menos 2 caracteres")
        return normalized
