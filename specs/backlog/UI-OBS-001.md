# UI-OBS-001: Renderizar Proyecciones Observacionales

**Status**: Backlog (disponible)
**Source**: Diferido de 003-observational-activation (Phase 2.4)
**Priority**: Low (no bloquea roadmap crítico)
**Effort**: ~2-4 hours

---

## Objetivo

Renderizar `ndvi_projection` y `grace_fo_projection` del API response (`/v2/climate-risk-analysis`) en la interfaz de usuario.

## Contexto

El backend ya envía estos campos en la respuesta API (climate.js:841-845), pero ningún componente frontend los consume.

## Archivos Afectados

| Archivo | Cambio |
|---|---|
| `src/features/climate-lookup/hooks/useClimateAnalysis.js` | Exponer `ndvi_projection`, `grace_fo_projection` del rawResponse |
| `src/pages/ClimateRiskLookup.jsx` | Pasar nuevos campos a componente de visualización |
| `src/components/climate/ObservationalProjectionCard.jsx` (nuevo) | Componente que renderiza las proyecciones observacionales |

## Criterios de Aceptación

1. `ndvi_projection` visible when MODIS NDVI data is available for the location
2. `grace_fo_projection` visible when GRACE-FO data is available
3. Card includes source, confidence, and temporal horizon
4. Falls back gracefully (null/not shown) when observational data is unavailable

## Notas

- El componente `ProjectionScenarioCard` existente maneja proyecciones IPCC (SSP). Se recomienda componente separado para proyecciones observacionales.
- No requiere cambios en backend.
- Desacoplado del roadmap crítico — puede ser asignado a sprint de UX.
