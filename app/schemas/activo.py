from pydantic import BaseModel

class ActivoCreate(BaseModel):
    nombre_host: str
    ip_gestion: str
    direccion_mac: str
    tipo_dispositivo: str