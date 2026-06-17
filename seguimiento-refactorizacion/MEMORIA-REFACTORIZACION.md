# MEMORIA DE REFACTORIZACIÓN — Estado Actual

> Archivo dinámico: se actualiza al completar cada tarea, no se acumula.
> Última actualización: 2026-06-17

---

## Estado General

| Campo | Valor |
|---|---|
| **Fase activa** | 2 — Nuevos Índices Compuestos (Cross-Source) |
| **Tarea actual** | 2.1 — Implementar WBGT + AQI compuesto |
| **Progreso global** | 5 / 16 tareas |
| **Bloqueos activos** | Ninguno |
| **Próxima acción** | Iniciar Fase 2.1 |

---

## Fases del Plan

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Fundación del Sistema de Memoria | ✅ Completada |
| 1 | Desbloquear Datos Existentes | ✅ Completada |
| 2 | Nuevos Índices Compuestos (Cross-Source) | 🏗️ En progreso |
| 3 | Framework de Riesgo IPCC Completo (A×E×V) | ⏳ Pendiente |
| 4 | Integración en Frontend, Señales y Narrativa | ⏳ Pendiente |
| 5 | Fuentes con Bloqueo / Expansión | ⏳ Pendiente |

---

## Historial de Tareas Completadas

| # | Tarea | Commit | Fecha | Notas |
|---|---|---|---|---|
| 0.1 | Crear infraestructura de memoria dinámica | `db28ea4` | 2026-06-17 | 3 archivos en `seguimiento-refactorizacion/` |
| 1.1 | Añadir soil_moisture + RH + wind + pressure + cloud_cover + radiation a Open-Meteo | `c8b50ef` | 2026-06-17 | 7 nuevas variables en `climateData` por período, incluido `tnn` |
| 1.2 | Añadir T2MDEW (punto de rocío) a NASA POWER | `f27da3c` | 2026-06-17 | `nasaPowerData` incluye T2MDEW |
| 1.3 | Añadir slums y conectar GDP/cápita a World Bank | `09a3975` | 2026-06-17 | Slums y GDP en `contextMessages` |
| 1.4 | Preservar serie temporal 7d de NASA POWER | `3f1ed0d` | 2026-06-17 | `daily[]` array con los 7 días por parámetro |

---

## Bloqueos Activos

| ID | Tarea afectada | Descripción | Estado |
|---|---|---|---|
| — | — | — | — |

---

## Próximas Acciones

1. ✅ Fase 1 — Completa (4 tareas, 4 commits)
2. ⏳ Fase 2.1 — WBGT + AQI compuesto
3. ⏳ Fase 2.2 — Índice compuesto de sequía multi-señal
4. ⏳ Fase 2.3 — Riesgo condicional ENSO con serie ONI histórica
