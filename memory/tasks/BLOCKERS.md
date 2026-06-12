# BLOCKERS — Impedimentos Activos

**Actualizado:** 2026-05-26

---

## Bloqueadores activos

*Ninguno crítico actualmente.* El trabajo P0 puede iniciarse inmediatamente.

---

## Dependencias que bloquean tareas futuras

| Bloqueador | Desbloquea | Acción requerida |
|-----------|-----------|-----------------|
| P0.4 (@ts-nocheck eliminado) | P1.3 (migrar TemporalPeriod) | Completar P0.4 primero |
| P1.1 (temporal.ts creado) | P1.3, P1.4 | Crear archivo antes de migrar |
| P1.3 (ClimateHorizon migrado) | P2.3, P2.4 | Completar P1 sprint 1 |
| P2.1 (ontology.ts creado) | P2.3, P2.4, P3.1 | Crear archivo antes de migrar |
| LocationContext model | P3.2 (regionalización umbrales) | Definir modelo de ubicación con región |
| OQ-002 (confirmar clientes API) | P1.4 (unificar PERIOD_MAPS) | Verificar si hay consumidores externos de /api/climate-risks/lookup |

---

## Riesgos que podrían convertirse en bloqueadores

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| @ts-nocheck oculta errores de tipo graves que requieren refactor grande | Media | Corregir errores mínimos, no refactorizar completo en P0.4 |
| P1.7 (unificar narrativa) rompe más tests de los esperados | Media | Mantener sanitizeNarrative activo hasta tests migrados |
| P1.4 rompe clientes externos de /api/climate-risks/lookup | Baja | Verificar en OQ-002 antes de ejecutar |

---

## Información de entorno

```
Node: D:\Usuarios\PM75161698\node-v24.15.0-win-x64\node-v24.15.0-win-x64
OS: Windows 11 Pro
Shell: PowerShell + Bash disponible
Tests: npm test (desde raíz del proyecto)
Build: npm run build
```
