# NetInventory Frontend

Aplicación web para gestión de infraestructura de red.

## Scripts

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5173
npm run build
```

## Proxy de la API

Las peticiones usan rutas relativas (`/api/...`) para que el navegador se conecte al mismo origen del frontend. Vite las reenvía al backend. El destino predeterminado para desarrollo local es `http://localhost:8000`; define `API_PROXY_TARGET` para cambiarlo. Docker Compose usa `http://backend:8000`, que es el nombre del servicio dentro de la red de Docker.