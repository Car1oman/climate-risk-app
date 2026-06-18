# TASK QUEUE — Cola de Tareas de Refactorización

> Archivo dinámico: las tareas se actualizan en esta tabla.
> Estados: `pending` → `in_progress` → `completed` | `blocked` | `manual_action_required`

---

## Tareas

| ID | Tarea | Fase | Estado | Dependencia | Resultado Observable | Commit |
|---|---|---|---|---|---|---|
| 0.1 | Crear infraestructura de memoria dinámica | 0 | ✅ `completed` | — | 3 archivos en `seguimiento-refactorizacion/` | `db28ea4` |
| 1.1 | 7 variables climáticas Open-Meteo | 1 | ✅ `completed` | 0.1 | soil_moisture, RH, wind, pressure, cloud_cover, radiation, tnn | `c8b50ef` |
| 1.2 | T2MDEW (punto de rocío) NASA POWER | 1 | ✅ `completed` | 1.1 | `nasaPowerData` incluye T2MDEW | `f27da3c` |
| 1.3 | slums + GDP/cápita World Bank | 1 | ✅ `completed` | 1.2 | slums y GDP en contextMessages | `09a3975` |
| 1.4 | Serie temporal 7d NASA POWER | 1 | ✅ `completed` | 1.3 | `daily[]` array con 7 días | `3f1ed0d` |
| 2.1 | WBGT (Stull 2011) + AQI compuesto | 2 | ✅ `completed` | 1.2, 1.4 | `heatStressService.js` | `3a7d509` |
| 2.2 | Drought_Index multi-señal | 2 | ✅ `completed` | 1.1, 1.4 | `droughtCompositeService.js` | `0afc371` |
| 2.3 | ONI histórico + matriz transición ENSO | 2 | ✅ `completed` | 2.2 | `conditionalEnsoRiskService.js` | `2203d7c` |
| 3.1 | Exposición multi-amenaza + vulnerabilidad GRI | 3 | ✅ `completed` | 2.3 | `griExposureVulnerabilityService.js` | `296b7e2` |
| 3.2 | Score (P×I)/CA del Manual de Adaptación | 3 | ✅ `completed` | 3.1 | `riskCalibrationService.js` | `6425d71` |
| 3.3 | Tendencia capacidad adaptativa 6 WB proxies | 3 | ✅ `completed` | 3.2 | `adaptiveCapacityService.js` | `aad9fad` |
| 4.1 | 7 señales compuestas en Layer2 SignalEngine | 4 | ✅ `completed` | 3.3 | Nuevos signalType registrados | `355ec5f` |
| 4.2 | UI: SIGNAL_META, SIGNAL_TO_CONSOLIDATED, ClimateStoryCard, LegacySignalRow | 4 | ✅ `completed` | 4.1 | UI actualizada | `d2162b3` |
| 4.3 | Layer6 NarrativeEngine — Anexos 10.2/10.1, Manual 30-03 | 4 | ✅ `completed` | 4.2 | 650 tests | `dc1009e` |
| 5.1 | Reemplazar AppEEARS v2 + HDF con ORNL DAAC REST API | 5 | ✅ `completed` | 4.3 | `modisNdviService.js` sin auth, sin HDF, JSON directo | pendiente |
| **5.2** | **Expandir ensemble CMIP6 a 5+ modelos con spread real** | **5** | **🏗️ `in_progress`** | **5.1** | **`uncertainty.spread` con datos multi-modelo** | **—** |

---

## Tareas Intermedias (Bloqueos)

| ID | Tarea | Originada por | Estado | Commit |
|---|---|---|---|---|
| B-001 | AppEEARS v2 POST 403 → ORNL DAAC REST API | 5.1 | ✅ `resolved` | — |
