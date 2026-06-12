# OPEN QUESTIONS

Preguntas sin resolver que bloquean o afectan decisiones de implementación.

---

## OQ-001 — ¿Eliminar o mantener sanitizeNarrative.ts en P1.7?

**Contexto:** `sanitizeNarrative.ts` tiene 40+ patrones de reemplazo técnico→ejecutivo y 68 tests. `buildOperationalNarrative.ts` genera texto ejecutivo directamente. Si se elimina `sanitizeNarrative`, ¿los tests existentes se migran a `buildOperationalNarrative`?  
**Impacto:** Si se elimina incorrectamente, el texto de Layer9 puede llegar crudo a la UI.  
**Decisión pendiente:** Determinar qué rutas de código usan `sanitizeNarrative` directamente vs `buildOperationalNarrative`.  
**Bloqueado por:** P1.7 (traslape narrativa)  
**Prioridad:** P1

---

## OQ-002 — ¿PERIOD_MAPS en climate.js:417-431 es un endpoint público?

**Contexto:** `GET /api/climate-risks/lookup` devuelve `['historico', 'corto', 'mediano']` (sin `_plazo`). Si algún cliente externo consume este endpoint, cambiar los keys es un breaking change real.  
**Impacto:** Si hay clientes externos, necesitamos adapter en lugar de cambio directo.  
**Decisión pendiente:** Confirmar si hay consumidores externos de este endpoint.  
**Prioridad:** P1 (antes de P1.4)

---

## OQ-003 — ¿Tipar ClimateRiskLookup como .tsx o mantener .jsx?

**Contexto:** Al eliminar `@ts-nocheck`, los 3 archivos JSX necesitan tipado correcto. Pueden quedarse como `.jsx` con JSDoc o convertirse a `.tsx`.  
**Trade-off:** `.tsx` da type checking completo; `.jsx` con JSDoc es menos disruptivo.  
**Decisión pendiente:** Confirmar preferencia del equipo.  
**Prioridad:** P0.4

---

## OQ-004 — ¿Cuál es el path de Node.js para scripts de validación?

**Contexto:** Node instalado en `D:\Usuarios\PM75161698\node-v24.15.0-win-x64\node-v24.15.0-win-x64`. Los scripts de test y build deben usar este path.  
**Estado:** Resuelto operativamente — usar `npm run test` desde el directorio del proyecto. Node path ya configurado en scripts del package.json.  
**Prioridad:** Informativo

---

## OQ-005 — ¿Activar near_term en UI requiere cambios en backend?

**Contexto:** `near_term` ya existe en los datos normalizados (`normalizeRisks.ts` produce `period: 'corto_plazo'`). El bug es solo en el frontend (PERIOD_TABS y filtros). No requiere cambios en backend para P0.6.  
**Estado:** CONFIRMADO — fix es solo frontend.  
**Prioridad:** P0.6 (trivial)
