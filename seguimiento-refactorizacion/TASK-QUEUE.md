# TASK QUEUE — Cola de Tareas de Refactorización

> Archivo dinámico: las tareas se actualizan en esta tabla (no se añaden líneas infinitas).
> Estados: `pending` → `in_progress` → `completed` | `blocked` | `manual_action_required`

---

## Tareas

| ID | Tarea | Fase | Estado | Dependencia | Resultado Observable | Commit |
|---|---|---|---|---|---|---|
| 0.1 | Crear infraestructura de memoria dinámica | 0 | ✅ `completed` | — | 3 archivos creados en `seguimiento-refactorizacion/` | — |
| 1.1 | Añadir soil_moisture + RH + wind + pressure + cloud_cover a Open-Meteo | 1 | ⏳ `pending` | 0.1 | `climateData` incluye `soil_moisture`, `relative_humidity`, `wind_speed` por período | — |
| 1.2 | Añadir T2MDEW (punto de rocío) a NASA POWER | 1 | ⏳ `pending` | 1.1 | `nasaPowerData` incluye `T2MDEW` en la respuesta | — |
| 1.3 | Añadir slums (EN.POP.SLUM.UR.ZS) y conectar GDP/cápita a World Bank | 1 | ⏳ `pending` | 1.2 | `territorialData.indicators` incluye slums, GDP usado en `contextMessages` | — |
| 1.4 | Preservar serie temporal 7d de NASA POWER en lugar de colapsar a 1 punto | 1 | ⏳ `pending` | 1.3 | `nasaPowerData.recent.daily` contiene los 7 valores diarios | — |
| 2.1 | Implementar WBGT + AQI compuesto | 2 | ⏳ `pending` | 1.2, 1.4 | `fusedData.heatStressIndex` con valor numérico y categoría | — |
| 2.2 | Implementar índice compuesto de sequía multi-señal | 2 | ⏳ `pending` | 1.1, 1.4 | `fusedData.droughtCompositeIndex` con señales individuales y peso total | — |
| 2.3 | Implementar riesgo condicional ENSO con serie ONI histórica completa | 2 | ⏳ `pending` | 2.2 | `fusedData.ensoAdjustedRisk` con factor de ajuste porcentual y distribución de fases | — |
| 3.1 | Extraer exposición y vulnerabilidad de GRI Oxford | 3 | ⏳ `pending` | 2.3 | `griData` incluye secciones `exposure` y `vulnerability` | — |
| 3.2 | Implementar AHP Risk Framework (Hazard × Exposure × Vulnerability) | 3 | ⏳ `pending` | 3.1 | `fusedData.ahpRiskScore` con desglose A/E/V y score compuesto 0-100 | — |
| 3.3 | Implementar tendencia de capacidad adaptativa con series WB históricas | 3 | ⏳ `pending` | 3.2 | `fusedData.adaptiveCapacityTrend` con pendiente por indicador | — |
| 4.1 | Registrar nuevas señales compuestas en Layer2 SignalEngine | 4 | ⏳ `pending` | 3.3 | Nuevos `signalType` aparecen en la respuesta de signals | — |
| 4.2 | Actualizar componentes UI para nuevos índices | 4 | ⏳ `pending` | 4.1 | UI muestra desglose de riesgo (A/E/V) vs score único | — |
| 4.3 | Actualizar Layer6 NarrativeEngine para nuevas dimensiones | 4 | ⏳ `pending` | 4.2 | Narrativa incluye párrafos de exposición, vulnerabilidad, estrés térmico | — |
| 5.1 | Resolver autenticación Earthdata para AppEEARS (NDVI) | 5 | ⏳ `pending` | 4.3 | `ndviData` retorna datos NDVI/NDWI/VHI en lugar de null | — |
| 5.2 | Expandir ensemble CMIP6 a 5+ modelos con spread real | 5 | ⏳ `pending` | 5.1 | `uncertainty.spread` tiene valores basados en datos, no hardcodeados | — |

---

## Tareas Intermedias (Bloqueos)

| ID | Tarea | Originada por | Estado | Commit |
|---|---|---|---|---|
| — | — | — | — | — |
