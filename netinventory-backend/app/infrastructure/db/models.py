import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, DateTime, ForeignKey
)
from sqlalchemy.dialects.postgresql import UUID, INET, MACADDR, JSONB
from sqlalchemy.orm import declarative_base, relationship

# Base declarativa que sirve como clase padre para todos los modelos ORM (mapeo objeto-relacional)
Base = declarative_base()

class RolModel(Base):
    __tablename__ = "roles"  # Nombre de la tabla en PostgreSQL

    # Llave primaria autoincremental para identificar el rol
    id_rol = Column(Integer, primary_key=True, autoincrement=True)
    # Nombre del rol único (ej. Administrador, Técnico, Auditor)
    nombre = Column(String, unique=True, nullable=False)
    descripcion = Column(Text)
    # Fecha de creación con zona horaria por defecto (UTC actual)
    fecha_creacion = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Relación: Un rol puede estar asignado a múltiples usuarios (1 a Muchos)
    usuarios = relationship("UsuarioModel", back_populates="rol")


class UsuarioModel(Base):
    __tablename__ = "usuarios"

    # Llave primaria basada en UUID v4 (identificador único universal)
    id_usuario = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Llave foránea que conecta al usuario con su respectivo rol
    id_rol = Column(Integer, ForeignKey("roles.id_rol"), nullable=False)
    nombre_usuario = Column(String, unique=True, nullable=False)
    correo = Column(String, unique=True, nullable=False)
    # Almacena el hash seguro de la contraseña (nunca texto plano)
    hash_clave = Column(String, nullable=False)
    activo = Column(Boolean, default=True)
    ultimo_acceso = Column(DateTime(timezone=True))

    # Relación inversa hacia la tabla roles
    rol = relationship("RolModel", back_populates="usuarios")


class UbicacionModel(Base):
    __tablename__ = "ubicaciones"

    id_ubicacion = Column(Integer, primary_key=True, autoincrement=True)
    nombre_centro_datos = Column(String, nullable=False)
    codigo_sala = Column(String)
    direccion = Column(Text)
    clasificacion_tier = Column(String)  # Ej. Tier III, Tier IV

    # Relación: Una ubicación (centro de datos) contiene varios racks o bastidores
    racks = relationship("BastidorRackModel", back_populates="ubicacion")


class BastidorRackModel(Base):
    __tablename__ = "bastidores_racks"

    id_rack = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Llave foránea para ubicar en qué centro de datos se encuentra el rack
    id_ubicacion = Column(Integer, ForeignKey("ubicaciones.id_ubicacion"), nullable=False)
    identificador = Column(String, nullable=False)
    unidades_ru = Column(Integer, nullable=False)  # Capacidad en Unidades de Rack (ej. 42U)
    potencia_max_watt = Column(Integer)
    numero_fila = Column(String)

    # Relaciones con ubicación y con los dispositivos montados dentro de él
    ubicacion = relationship("UbicacionModel", back_populates="racks")
    dispositivos = relationship("DispositivoModel", back_populates="rack")


class TipoDispositivoModel(Base):
    __tablename__ = "tipos_dispositivo"

    id_tipo = Column(Integer, primary_key=True, autoincrement=True)
    categoria = Column(String, nullable=False)  # Ej. Router, Switch, Servidor, etc.
    fabricante = Column(String)
    modelo = Column(String)
    altura_ru = Column(Integer, default=1)  # Cuánto espacio físico ocupa en Unidades de Rack

    dispositivos = relationship("DispositivoModel", back_populates="tipo")


class DispositivoModel(Base):
    __tablename__ = "dispositivos"

    id_dispositivo = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Llaves foráneas para saber qué tipo de dispositivo es y en qué rack está montado
    id_tipo = Column(Integer, ForeignKey("tipos_dispositivo.id_tipo"), nullable=False)
    id_rack = Column(UUID(as_uuid=True), ForeignKey("bastidores_racks.id_rack"), nullable=True)
    nombre_host = Column(String, unique=True, nullable=False)
    fqdn = Column(String)
    numero_serie = Column(String)
    
    # ⚠️ TIPO NATIVO DE POSTGRESQL PARA REDES: INET
    # Valida y almacena direcciones IP directamente optimizadas en la base de datos
    ip_gestion = Column(INET, nullable=False) 
    
    ru_inicio = Column(Integer)  # Posición o slot inicial donde se monta en el rack
    estado_operativo = Column(String, default="activo")

    # Relaciones de pertenencia
    tipo = relationship("TipoDispositivoModel", back_populates="dispositivos")
    rack = relationship("BastidorRackModel", back_populates="dispositivos")
    interfaces = relationship("InterfaceRedModel", back_populates="dispositivo")


class SubredModel(Base):
    __tablename__ = "subredes"

    id_vlan = Column(Integer, primary_key=True, autoincrement=True)
    etiqueta_vlan = Column(Integer, unique=True, nullable=False)  # Número de VLAN (ej. 10, 20)
    nombre_segmento = Column(String, nullable=False)
    descripcion = Column(Text)

    # Relación: Una subred agrupa un conjunto de direcciones IP individuales (IPAM)
    direcciones_ip = relationship("DireccionIPModel", back_populates="subred")


class DireccionIPModel(Base):
    __tablename__ = "direcciones_ip"

    id_ip = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_subred = Column(Integer, ForeignKey("subredes.id_vlan"), nullable=False)
    
    # ⚠️ TIPO NATIVO DE POSTGRESQL PARA REDES: INET (Dirección IP específica)
    direccion = Column(INET, unique=True, nullable=False) 
    
    estado_asignacion = Column(String, default="libre")  # Control IPAM: libre, ocupada, reservada
    proposito = Column(String)

    subred = relationship("SubredModel", back_populates="direcciones_ip")
    interfaces = relationship("InterfaceRedModel", back_populates="direccion_ip")


class InterfaceRedModel(Base):
    __tablename__ = "interfaces_red"

    id_interfaz = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_dispositivo = Column(UUID(as_uuid=True), ForeignKey("dispositivos.id_dispositivo"), nullable=False)
    id_direccion_ip = Column(UUID(as_uuid=True), ForeignKey("direcciones_ip.id_ip"), nullable=True)
    nombre_puerto = Column(String, nullable=False)  # Ej. GigabitEthernet0/1 o eth0
    
    # ⚠️ TIPO NATIVO DE POSTGRESQL PARA REDES: MACADDR
    # Almacena y valida direcciones físicas MAC de manera nativa
    direccion_mac = Column(MACADDR) 
    
    tipo_medio = Column(String)  # Cobre, Fibra óptica
    velocidad_mbps = Column(Integer)  # 1000, 10000 (Mbps)
    estado_activo = Column(Boolean, default=True)

    # Relaciones con su dispositivo contenedor y su IP asignada
    dispositivo = relationship("DispositivoModel", back_populates="interfaces")
    direccion_ip = relationship("DireccionIPModel", back_populates="interfaces")
