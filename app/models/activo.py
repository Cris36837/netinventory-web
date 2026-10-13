from sqlalchemy import Column, Integer, String
from app.database import Base

class Activo(Base):
    __tablename__ = "activos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String)
    ip = Column(String, unique=True)
    mac = Column(String, unique=True)
    tipo = Column(String)
    estado = Column(String)