from pydantic import BaseModel, EmailStr

class UsuarioCreate(BaseModel):
    nombre_usuario: str
    correo: EmailStr
    password: str
    rol: str  # SuperAdmin, Tecnico, Auditor

class LoginRequest(BaseModel):
    correo: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str