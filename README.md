# NetInventory

Sistema web para gestión y monitoreo de infraestructura de red. El repositorio contiene una aplicación React/Vite, una API FastAPI y servicios PostgreSQL y Redis ejecutables con Docker Compose.

> El alcance actual incluye autenticación, usuarios/roles, gestión de activos, IPAM, diagnóstico manual y monitoreo periódico. Redis está incluido en la infraestructura de desarrollo, pero aún no tiene una función conectada a la aplicación.

## Requisitos

- Docker Desktop (Windows/macOS) o Docker Engine y Docker Compose.
- En Windows, inicia Docker Desktop antes de ejecutar los comandos. Docker Desktop debe estar usando contenedores Linux (la opción predeterminada).
- Para desarrollo sin Docker: Python 3.12 o superior y Node.js 20 o superior.

## Llevar el proyecto a otro equipo

En el equipo de destino, instala y abre Docker Desktop (Windows/macOS) o instala Docker Engine y el complemento Docker Compose (Linux). No es necesario instalar Python, Node.js, PostgreSQL ni Redis para ejecutar el proyecto con Docker.

Clona el repositorio y entra a la carpeta que contiene `docker-compose.yml`:

```powershell
git clone https://github.com/Cris36837/netinventory-web.git
Set-Location netinventory-web
```

También se puede descargar el ZIP desde GitHub y extraerlo; en ese caso, abre una terminal en la carpeta extraída que contiene `docker-compose.yml`. La base de datos y los datos creados en otro equipo no vienen incluidos al clonar o descargar el código: cada instalación crea y conserva su propio volumen local de PostgreSQL.

## Inicio con Docker

Desde la raíz del repositorio, construye las imágenes e inicia los servicios en segundo plano:

```powershell
docker compose up --build -d
docker compose ps
```

Espera a que PostgreSQL y el backend aparezcan como `healthy` en `docker compose ps`. Después abre la aplicación:

| Servicio | URL/puerto |
| --- | --- |
| Frontend | http://localhost:5173 |
| API y documentación OpenAPI (opcional) | http://localhost:8000/docs |
| Salud de la API (opcional) | http://localhost:8000/health |

La salida de `docker compose ps` permite verificar que los contenedores están activos. Para ver los registros del backend mientras funciona:

```powershell
docker compose logs -f backend
```

Pulsa `Ctrl+C` para dejar de ver los registros; esto no detiene los servicios. Para detenerlos:

```powershell
docker compose down
```

Para iniciarlos de nuevo sin reconstruir:

```powershell
docker compose up -d
```

### Abrir la aplicación desde otro equipo o una máquina virtual

Si el navegador está dentro del mismo equipo que ejecuta Docker, usa `http://localhost:5173`. Si está en otro equipo, averigua la dirección IP del equipo que ejecuta Docker y abre `http://<IP-del-equipo-con-Docker>:5173`. En Windows, la IP se puede consultar con `ipconfig`.

Para acceder desde otro equipo:

1. Asegúrate de que ambos equipos puedan comunicarse por la red.
2. Permite conexiones entrantes al puerto TCP `5173` en el firewall del equipo con Docker.
3. Si Docker se ejecuta dentro de una máquina virtual, configura su adaptador de red en modo puente o crea una regla de reenvío de puertos desde el equipo anfitrión al puerto `5173` de la VM. La configuración depende del programa de virtualización.
4. Abre `http://<IP-de-la-VM>:5173` desde el navegador del otro equipo. Si usaste reenvío de puertos, utiliza la dirección y el puerto configurados en el anfitrión.

El navegador usa el frontend como origen y este reenvía `/api` al backend por la red interna de Docker. Por eso no hay que poner la IP de la VM en el código ni configurar CORS para cada equipo. `localhost` siempre significa “este mismo equipo” desde la perspectiva del navegador. El puerto `8000` solo se necesita si se quiere abrir directamente la documentación de la API; no es necesario para usar la aplicación. No expongas PostgreSQL ni Redis a redes públicas.

Si un puerto publicado ya está ocupado, cambia el puerto en el equipo que ejecuta Docker. Por ejemplo, para usar `8080` en lugar de `5173`:

```powershell
$env:FRONTEND_PORT = "8080"
docker compose up --build -d
```

En ese caso, abre `http://localhost:8080` o `http://<IP-del-equipo-con-Docker>:8080`. También se pueden cambiar los puertos publicados con las variables `BACKEND_PORT`, `POSTGRES_PORT` y `REDIS_PORT`. Estas variables deben definirse en la misma terminal antes de ejecutar Compose.

`docker compose down` detiene y elimina los contenedores, pero conserva los datos de PostgreSQL en el volumen `postgres_data`. **No uses `docker compose down -v` salvo que quieras borrar permanentemente los datos locales de la base de datos.** El SQL de `database/init.sql` solo se ejecuta al crear por primera vez el volumen de PostgreSQL.

### Uso inicial y solución de problemas

La base inicial incluye una cuenta de desarrollo:

- Correo: `admin@netinventory.com`
- Contraseña: `admin123`

Inicia sesión con esas credenciales y cambia la contraseña antes de cualquier uso fuera de una demostración local. Admin puede gestionar usuarios y activos; Técnico puede gestionar activos y ejecutar diagnósticos; Auditor tiene acceso de consulta. Los cambios de datos se guardan en la base de datos local del equipo.

Si la página de login abre pero el dashboard no carga, comprueba los servicios y consulta los registros:

```powershell
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 postgres
```

También puedes comprobar la API desde el equipo con Docker abriendo `http://localhost:8000/health`. Si no responde, revisa que el backend esté `healthy` y los registros de `backend` y `postgres`. Si la aplicación abre localmente pero no desde otro equipo, revisa la IP, la conectividad entre equipos, el firewall y la configuración de red o reenvío de puertos de la VM. Si el puerto `5173` ya está en uso, prueba con `FRONTEND_PORT` como se describe arriba.

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
| Ejecutar ping o escaneo de puertos | Sí | Sí | No |
| Consultar estado e historial de monitoreo | Sí | Sí | Sí |

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

## Sprint 5: diagnóstico manual y monitoreo

El dashboard incluye un menú lateral que organiza el resumen, activos, IPAM, diagnóstico y administración de usuarios según el rol autenticado. Admin y Técnico pueden probar conectividad ICMP y ejecutar escaneos manuales TCP/UDP contra dispositivos registrados con IP de gestión. Cada solicitud admite hasta 100 puertos únicos; UDP puede reportarse como `open|filtered` cuando no hay respuesta, porque un datagrama sin respuesta no permite afirmar que el puerto esté cerrado.

Un worker asíncrono inicia con la API y sondea por ICMP los dispositivos operativos que tienen IP de gestión. El intervalo predeterminado es de 60 segundos y puede ajustarse con `MONITORING_INTERVAL_SECONDS` (mínimo 15 segundos). Los resultados manuales y automáticos quedan en `resultados_sondeo`; las tablas faltantes se crean al iniciar, incluso si se conserva un volumen PostgreSQL.

| Método | Ruta | Permiso | Uso |
| --- | --- | --- | --- |
| `POST` | `/api/v1/devices/{device_id}/diagnostics/ping` | Admin o Técnico | Ejecuta y guarda un ping ICMP manual |
| `POST` | `/api/v1/devices/{device_id}/diagnostics/ports` | Admin o Técnico | Escanea hasta 100 puertos TCP o UDP del activo |
| `GET` | `/api/v1/monitoring/status` | Usuario autenticado | Consulta el último sondeo automático por activo |
| `GET` | `/api/v1/monitoring/results?limit=20` | Usuario autenticado | Consulta el historial reciente (máximo 100) |

El worker requiere que el ejecutor `ping` esté disponible. La imagen Docker instala `iputils-ping`; en ejecución local debe estar instalado en el sistema operativo. Los endpoints manuales solo aceptan el identificador de un activo existente, no una IP arbitraria. Auditor puede consultar estado e historial, pero no iniciar pruebas.

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

En Docker Compose, `DATABASE_URL`, `JWT_SECRET_KEY` y `JWT_ALGORITHM` configuran la conexión a PostgreSQL y la firma de tokens. `API_PROXY_TARGET` apunta el proxy de desarrollo del frontend al servicio backend en la red interna de Docker; en ejecución local de Vite, el valor predeterminado es `http://localhost:8000`.

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
npm run dev -- --host 0.0.0.0 --port 5173
```

Las llamadas a la API usan rutas relativas (`/api/...`). El proxy de Vite las reenvía a `http://localhost:8000` por defecto en desarrollo local; puedes cambiar el destino definiendo `API_PROXY_TARGET`.

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
