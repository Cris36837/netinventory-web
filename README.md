# NetInventory

Sistema web para gestión y monitoreo de infraestructura de red. El repositorio contiene una aplicación React/Vite, una API FastAPI y servicios PostgreSQL y Redis ejecutables con Docker Compose.

> El alcance actual incluye autenticación, usuarios/roles, gestión de activos e IPAM. Redis está incluido en la infraestructura de desarrollo, pero aún no tiene una función conectada a la aplicación.

## Requisitos

- Docker Desktop (Windows/macOS) o Docker Engine y Docker Compose.
- Para desarrollo sin Docker: Python 3.12 o superior y Node.js 20 o superior.

## Inicio con Docker

Desde la raíz del repositorio:

```bash
docker compose up --build
```

Cuando los servicios estén listos, abre:

| Servicio | URL/puerto |
| --- | --- |
| Frontend | http://localhost:5173 |
| API y documentación OpenAPI | http://localhost:8000/docs |
| Salud de la API | http://localhost:8000/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

El frontend y el backend montan el código local como volumen para facilitar el desarrollo. Para ejecutar los contenedores en segundo plano, añade `-d`:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend
docker compose down
```

`docker compose down` detiene y elimina los contenedores, pero conserva los datos de PostgreSQL en el volumen `postgres_data`. **No uses `docker compose down -v` salvo que quieras borrar también permanentemente los datos de desarrollo de la base de datos.** El SQL de `database/init.sql` solo se ejecuta al crear por primera vez el volumen de PostgreSQL.

## Inicio de sesión y autenticación

La base inicial crea el usuario de desarrollo:

- Correo: `admin@netinventory.com`
- Contraseña: `admin123`

Inicia sesión desde el frontend con esas credenciales. El backend busca el correo en PostgreSQL, compara la contraseña con el hash bcrypt almacenado y solo entonces emite un JWT con vigencia de 60 minutos. El frontend guarda el token en `localStorage` y lo usa para permitir la navegación al dashboard; no hay renovación automática del token.

### Endpoints

`POST /api/v1/auth/login`

Petición:

```json
{
  "correo": "admin@netinventory.com",
  "password": "admin123"
}
```

Respuesta satisfactoria (`200 OK`):

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

Las credenciales incorrectas reciben `401 Unauthorized`.

`GET /api/v1/auth/me` requiere el token en el encabezado `Authorization: Bearer <jwt>` y devuelve los datos básicos de la cuenta autenticada. Sin token, con un token inválido o expirado, responde `401 Unauthorized`.

`GET /health` comprueba que la API está respondiendo. La especificación interactiva de los endpoints está en http://localhost:8000/docs.

## Sprint 3: usuarios, roles y activos de red

### Roles y permisos (RBAC)

La API aplica permisos en el backend; ocultar controles en la interfaz no se considera un control de seguridad.

| Operación | Admin | Técnico | Auditor |
| --- | --- | --- | --- |
| Consultar dispositivos y tipos | Sí | Sí | Sí |
| Crear o editar dispositivos | Sí | Sí | No |
| Eliminar dispositivos | Sí | No | No |
| Consultar y administrar usuarios/roles | Sí | No | No |

La gestión de cuentas permite crear usuarios, asignar uno de los tres roles y cambiar rol o estado activo. Las cuentas se desactivan, no se borran. La API impide desactivar o quitar el rol al último administrador activo. Las contraseñas se guardan como hashes bcrypt, nunca como texto claro.

### Endpoints de Sprint 3

Todas las rutas salvo `POST /api/v1/auth/login` requieren `Authorization: Bearer <JWT>`.

| Método | Ruta | Permiso | Uso |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Público | Valida credenciales y emite JWT |
| `GET` | `/api/v1/auth/me` | Usuario autenticado | Devuelve identidad y rol de la sesión |
| `GET` | `/api/v1/roles` | Admin | Lista los roles disponibles para asignación |
| `GET` | `/api/v1/users` | Admin | Lista usuarios sin exponer sus hashes |
| `POST` | `/api/v1/users` | Admin | Crea un usuario con contraseña y rol |
| `PATCH` | `/api/v1/users/{user_id}` | Admin | Actualiza nombre, correo, contraseña, rol o estado |
| `GET` | `/api/v1/device-types` | Usuario autenticado | Lista las categorías y tipos iniciales |
| `GET` | `/api/v1/racks` | Usuario autenticado | Lista racks disponibles para asignar (puede estar vacío) |
| `GET` | `/api/v1/devices` | Usuario autenticado | Lista dispositivos; admite filtro `?search=` |
| `GET` | `/api/v1/devices/{device_id}` | Usuario autenticado | Consulta un dispositivo |
| `POST` | `/api/v1/devices` | Admin o Técnico | Registra un dispositivo |
| `PATCH` | `/api/v1/devices/{device_id}` | Admin o Técnico | Actualiza un dispositivo |
| `DELETE` | `/api/v1/devices/{device_id}` | Admin | Elimina un dispositivo |

Los dispositivos se almacenan en `DISPOSITIVOS` y se relacionan con `TIPOS_DISPOSITIVO`; se puede registrar un activo sin rack. El catálogo inicial ofrece las categorías Servidor, Switch, Router, PC e Impresora. Host, FQDN, número de serie e IP de gestión son únicos cuando se proporcionan; la IP se valida antes de guardarla.

El formulario del dashboard permite registrar y editar activos. Admin puede además crear usuarios, asignar roles y activar/desactivar cuentas. Técnico puede registrar y modificar dispositivos. Auditor únicamente puede consultar los dispositivos.

## Sprint 4: integridad de activos y gestión IPAM

El dashboard permite crear subredes CIDR sin traslapes, consultar sus direcciones utilizables en páginas, reservar una IP libre y liberar una reserva. Las IP configuradas en activos aparecen como ocupadas; las direcciones de red y broadcast IPv4 no se ofrecen como hosts. Técnicos y Admin pueden gestionar subredes y reservas; Auditor puede consultar la tabla IPAM.

La API expone `GET/POST /api/v1/ipam/subnets`, `GET /api/v1/ipam/subnets/{id}/addresses`, `POST /api/v1/ipam/subnets/{id}/reservations` y `DELETE /api/v1/ipam/reservations/{id_ip}`. El alta y edición de activos valida y normaliza IP y MAC, y rechaza IPs reservadas. Las restricciones únicas en la base de datos impiden repetir las IP y MAC entre activos, así como repetir una IP reservada.

### Inicialización de la base de datos

`database/init.sql` define roles, usuarios y las tablas necesarias para el CRUD del sprint. Al arrancar, el backend crea de forma idempotente las tablas faltantes y asegura que existan los tres roles y tipos iniciales. Así el mismo arranque también prepara tablas nuevas cuando se conserva un volumen PostgreSQL de una ejecución anterior.

El usuario `admin@netinventory.com` con contraseña `admin123` es una cuenta **solo de desarrollo**. En una base persistente existente, un conflicto de correo no reemplaza la cuenta ni su contraseña. Si la contraseña no es válida, inicia sesión con una cuenta Admin existente y restablece la contraseña mediante gestión de usuarios, o prepara explícitamente un entorno de desarrollo nuevo. No borres volúmenes con datos que quieras conservar.

Prueba del login desde una terminal:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@netinventory.com","password":"admin123"}'
```

### Configuración y seguridad

En Docker Compose, `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM` y `CORS_ORIGINS` configuran la conexión a PostgreSQL, la firma de tokens, el algoritmo y los orígenes permitidos, respectivamente. `VITE_API_URL` configura la URL de la API utilizada por el frontend.

Las credenciales y la clave JWT incluidas en `docker-compose.yml` son exclusivamente valores locales de desarrollo. El backend no inicia si `JWT_SECRET_KEY` no está configurada con al menos 32 bytes. Antes de desplegar en un entorno real, genera una clave aleatoria y privada, configúrala como secreto de entorno, no publiques credenciales y sirve la aplicación mediante HTTPS. La cuenta inicial también usa una contraseña conocida: cámbiala antes de cualquier uso fuera del entorno local.

## Desarrollo local sin Docker

Primero inicia PostgreSQL con los valores de desarrollo del servicio `postgres` en Compose y asegúrate de que la base `netinventory_db` ya fue inicializada con `database/init.sql`:

```powershell
docker compose up -d postgres
```

Después, en terminales separadas:

Backend:

```powershell
cd backend
python -m pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+asyncpg://netuser:netpassword123@localhost:5432/netinventory_db"
$env:JWT_SECRET_KEY = "netinventory-local-development-key-change-before-deployment-2026"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```powershell
cd frontend
npm install
$env:VITE_API_URL = "http://localhost:8000"
npm run dev -- --host 0.0.0.0 --port 5173
```

## Compilar y revisar el frontend

Desde `frontend`:

```bash
npm run lint
npm run build
```

Vite escribe la compilación de producción en `frontend/dist`. Para servir esa compilación localmente:

```bash
npm run preview
```

El servicio frontend definido en Compose ejecuta el servidor de desarrollo de Vite, no el contenido de `dist`.

## ¿Qué son `frontend/dist` y `frontend/node_modules`?

- **`dist/`** contiene los archivos estáticos generados por `npm run build` (HTML, JavaScript, CSS y recursos optimizados). Se puede regenerar cuando sea necesario; no es el código fuente editable. Se ignora en Git y no es necesario conservarlo para ejecutar el modo de desarrollo de Compose.
- **`node_modules/`** contiene las dependencias JavaScript instaladas por `npm install` a partir de `package.json` y `package-lock.json`. Es específico del entorno, puede ocupar bastante espacio y no se debe subir a Git. Si se elimina, se puede reconstruir con `npm install`.
- **`package-lock.json`** sí debe conservarse y versionarse: fija las versiones resueltas de las dependencias para instalaciones reproducibles.

## Estructura principal

```text
backend/       API FastAPI, autenticación y dependencias Python
database/      SQL de inicialización de PostgreSQL
frontend/      Aplicación React/Vite
docker-compose.yml
```
