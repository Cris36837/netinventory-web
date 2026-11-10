from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import AuditLog

router = APIRouter(prefix="/api/v1/audit-logs", tags=["Auditoría"])

@router.get("")
def obtener_registros_auditoria(db: Session = Depends(get_db)):
    """
    Obtiene la bitácora de auditoría ordenada de la más reciente a la más antigua.
    """
    logs = db.query(AuditLog).order_by(AuditLog.fecha_creacion.desc()).all()
    return logs