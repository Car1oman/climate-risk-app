**Intercorp Retail - Clima**

Proyecto React + Vite con backend Express local. Esta aplicación ya no depende de Base44 y está preparada para comunicaciones REST entre frontend y backend.

## Desarrollo local

1. Navega a la carpeta del proyecto.
2. Instala dependencias: `npm install`
3. Inicia el frontend: `npm run dev`
4. Inicia el backend: `npm run server`

## Scripts disponibles

- `npm run dev` - Inicia Vite.
- `npm run server` - Inicia el servidor Express en `http://localhost:3001`.
- `npm run build` - Construye la aplicación.
- `npm run preview` - Previsualiza el build de producción.

## Backend local

El backend expone endpoints básicos:

- `GET /api/test` - Verifica que el servidor está activo.
- `POST /api/ai` - Retorna una respuesta simulada de IA basada en el prompt recibido.
