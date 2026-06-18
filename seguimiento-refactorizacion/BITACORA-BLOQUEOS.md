# BITÁCORA DE BLOQUEOS Y ACCIONES MANUALES

> Archivo dinámico: cada bloqueo se actualiza en su registro, no se acumulan entradas históricas.
> Formato: un bloqueo activo a la vez (el anterior pasa a `resolved`).

---

## Bloqueos Activos

*Ninguno por el momento.*

---

## Historial de Bloqueos Resueltos

| ID | Tarea afectada | Descripción | Acción tomada | Fecha resolución |
|---|---|---|---|---|
| B-001 | Fase 5.1 — AppEEARS cloud API v2 | POST /task retorna 403 incluso con Basic Auth y después de autorización del usuario. GET /product funciona (200). | Se abandona AppEEARS. Se reemplaza con ORNL DAAC MODIS Subset REST API (GET público, sin auth, retorna JSON directamente). Eliminada dependencia de earthdataAuth.js. | 2026-06-18 |

---

## Acciones Manuales Pendientes

| ID | Tarea | Acción requerida | Paso a paso | Estado |
|---|---|---|---|---|
| — | — | — | — | — |
