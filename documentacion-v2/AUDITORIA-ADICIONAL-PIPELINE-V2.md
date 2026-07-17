# Auditoría Adicional — Pipeline Climate Risk V2 (End-to-End)

**Fecha:** 2026-07-17  
**Alcance:** Toda la cadena pipeline: `pipeline/` + `server-new/` + `server/`  
**Objetivo:** Verificar coherencia, trazabilidad, correctitud técnica y resiliencia de cada stage y de las transiciones entre ellos.

---

## 1. Arquitectura General del Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  PipelineEngine.execute(bbox, runOptions)                          │
│  (pipeline/orchestration/engine.js)                                │
├─────────────────────────────────────────────────────────────────────┤
│  STAGE顺序:                                                        │
│  01-acquisition → 02-validation → 03-normalization → 04-signals    │
│  → 05-phenomena → 06-risk → 07-presentation                       │
├─────────────────────────────────────────────────────────────────────┤
│  Orquestación:                                                     │
│  - Secuencial, await chain                                         │
│  - Timeout por stage: 5 minutos                                    │
│  - Reintentos: 2 por stage                                         │
│  - Estado global: objeto JavaScript plano (Object.assign)          │
│  - Artefactos: in-memory Map (no persistencia a disco)             │
└─────────────────────────────────────────────────────────────────────┘
```

**Observaciones arquitectónicas:**

| Aspecto | Estado | Nota |
|---------|--------|------|
| Orquestación secuencial | ✅ Correcto | Cada stage espera al anterior |
| Timeout por stage | ✅ Implementado | 5 min configurable |
| Reintentos | ✅ Implementado | 2 intentos por stage |
| Aislamiento de estados | ⚠️ Riesgo | Object.assign mezcla claves entre stages |
| Persistencia de artefactos | ⚠️ Débil | Solo en memoria, se pierde al reiniciar |
| Manejo de errores | ⚠️ Inconsistente | Solo Stage 07 usa clases de error del módulo shared |

---

## 2. Descripción de Cada Stage

### Stage 01 — Acquisition (`pipeline/stages/01-acquisition/index.js`)

**Función:** Adquisición de datos crudos desde múltiples fuentes externas.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Adaptadores | 10 | CSV, JSON, API, etc. |
| Deduplicación | ✅ | En vuelo (in-flight) |
| Registro de fuentes | ✅ | SourceRegistry con config-loader |
| Cache | ✅ | Config cache con TTL de 60s |
| Errores | ⚠️ | No usa módulo shared/errors |

**Hallazgos:**
- H1.1: `adapter.parse()` no valida estructura del JSON antes de procesar
- H1.2: Logging excesivo en desarrollo (console.log sin filtro)

---

### Stage 02 — Validation (`pipeline/stages/02-validation/index.js`)

**Función:** Validación de datos contra reglas de negocio y esquemas.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Tamaño | 1051 líneas | Stage más grande del pipeline |
| Validaciones | Múltiples | Tipos, rangos, consistencia |
| Errores | ⚠️ | Sin estructura uniforme |

**Hallazgos Críticos:**
- H2.1: **HALLAZGO-3** — Comparación de fechas puede fallar con formatos mixtos
- H2.2: **HALLAZGO-4** — Estructura GRI Oxford no se valida correctamente
- H2.3: Falta validación de coordenadas geográficas contra bbox de Perú
- H2.4: Algunos campos se marcan como "warning" cuando deberían ser "error"

---

### Stage 03 — Normalization (`pipeline/stages/03-normalization/index.js`)

**Función:** Normalización y enriquecimiento de datos validados.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Tamaño | 1301 líneas | Stage más extenso |
| Normalización | ✅ |猫monización de unidades y formatos |
| Enriquecimiento | ✅ | Cálculos derivados |
| Ponderación | ⚠️ | 50/50 completeness/proximity (no resuelto) |

**Hallazgos:**
- H3.1: **H-A02** — Ponderación 50/50 entre completeness y proximity no resuelta
- H3.2: `calculateDistance()` usa fórmula simplificada (no Haversine)
- H3.3: Manejo de valores faltantes inconsistente entre substage

---

### Stage 04 — Signals (`pipeline/stages/04-signals/index.js`)

**Función:** Cálculo de señales climáticas a partir de datos normalizados.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Escritura reciente | ✅ | Totalmente reescrito |
| Confidence | ✅ | 630 líneas, modelado robusto |
| Señales | ✅ | Múltiples señales calculadas |

**Estado:** Este stage fue reescrito completamente. Los 5 hallazgos CRíticos reportados en auditorías previas han sido cerrados.

**Confidence Model (confidence.js):**
- `source_quality`: Calidad de la fuente de datos
- `signal_strength`: Fuerza de la señal calculada
- Ambos combinados para score final

---

### Stage 05 — Phenomena (`pipeline/stages/05-phenomena/index.js`)

**Función:** Identificación y clasificación de fenómenos climáticos.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Fenómenos | 9 tipificados | El Niño, La Niña, etc. |
| Hallazgos | ✅ | 20/20 cerrados |
| Documentación | ✅ | Único stage con sección de resolución |

**Estado:** Este stage tiene la documentación más completa y es el único con una sección explícita de resolución de hallazgos.

---

### Stage 06 — Risk (`pipeline/stages/06-risk/index.js`)

**Función:** Cálculo de métricas de riesgo climático.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Tamaño | 718 líneas | Complejidad moderada |
| Cálculos | ✅ | Risk scores por fenómeno |
| Documentación | ⚠️ | **Desincronizada con código** |

**Hallazgos:**
- H6.1: Documentación reporta hallazgos como "pendientes" pero código los tiene resueltos
- H6.2: Falta trazabilidad de cómo se propagan los risk scores al Stage 07

---

### Stage 07 — Presentation (`pipeline/stages/07-presentation/index.js`)

**Función:** Generación de reportes y artefactos de presentación.

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Tamaño | 676 líneas | Complejidad moderada |
| Errores | ✅ | Único stage que usa módulo shared/errors |
| Documentación | ⚠️ | **Desincronizada con código** |

**Hallazgos:**
- H7.1: `calculateOverallRisk()` usa max-risk sin considerar cantidad de fenómenos
- H7.2: Documentación reporta hallazgos pendientes que en código ya están resueltos
- H7.3: Solo este stage maneja errores con clases tipadas (StageError, etc.)

---

## 3. Mapa de Flujo de Datos

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  External    │    │  Validation  │    │ Normalization│
│  Sources     │───▶│  Rules       │───▶│  Transforms  │
└──────────────┘    └──────────────┘    └──────────────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────┐    ┌──────────────┐
                    │  Raw Data    │    │  Normalized  │
                    │  (Stage 01)  │    │  Data        │
                    └──────────────┘    └──────────────┘
                                               │
                           ┌───────────────────┘
                           ▼
                    ┌──────────────┐    ┌──────────────┐
                    │  Signals     │───▶│  Phenomena   │
                    │  (Stage 04)  │    │  (Stage 05)  │
                    └──────────────┘    └──────────────┘
                                               │
                           ┌───────────────────┘
                           ▼
                    ┌──────────────┐    ┌──────────────┐
                    │  Risk        │───▶│  Presentation│
                    │  (Stage 06)  │    │  (Stage 07)  │
                    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  HTTP API    │
                                        │  Response    │
                                        └──────────────┘
```

**Transiciones críticas:**
- Stage 01 → 02: Datos crudos → datos tipados (punto de pérdida de información)
- Stage 03 → 04: Normalización → señales (punto de divergencia de accuracy)
- Stage 06 → 07: Risk scores → presentación (punto de agregación)

---

## 4. Auditoría de Consistencia

### 4.1 Consistencia entre stages

| Transición | Estado | Riesgo |
|------------|--------|--------|
| 01 → 02 | ⚠️ | Stage 02 no valida contra schema de Stage 01 |
| 02 → 03 | ✅ | Contrato definido |
| 03 → 04 | ⚠️ | Dependencia implícita de campos calculados |
| 04 → 05 | ✅ | Contrato definido |
| 05 → 06 | ⚠️ | Fenómenos propagados sin validación cruzada |
| 06 → 07 | ⚠️ | Risk scores propagados sin metadatos |

### 4.2 Consistencia documentación vs código

| Stage | Documentación | Código | Estado |
|-------|---------------|--------|--------|
| 01 | ✅ | ✅ | Sincronizado |
| 02 | ⚠️ | ✅ | Parcialmente desincronizado |
| 03 | ⚠️ | ✅ | Parcialmente desincronizado |
| 04 | ✅ | ✅ | Sincronizado (reescrito recientemente) |
| 05 | ✅ | ✅ | Sincronizado |
| 06 | ❌ | ✅ | **Desincronizado** — docs reportan bugs que código ya resolvió |
| 07 | ❌ | ✅ | **Desincronizado** — docs reportan bugs que código ya resolvió |

---

## 5. Fallos Silenciosos

| Ubicación | Tipo | Impacto |
|-----------|------|---------|
| Stage 01 | Datos faltantes se saltan sin error | Datos incompletos propagados |
| Stage 02 | Warnings en vez de errors | Datos inválidos pasan validación |
| Stage 03 | Campos vacíos se promedian como 0 | Métricas distorsionadas |
| Stage 04 | Señales sin datos se calculan con defaults | Señales artificiales |
| Stage 05 | Fenómenos no identificados se ignoran | Cobertura incompleta |
| Stage 06 | Risk scores sin datos se setean en 0 | Riesgo subestimado |
| Stage 07 | Errores de render se atrapan y devuelven parcial | Respuesta incompleta |

---

## 6. Trazabilidad

### 6.1 Trazabilidad de datos

| Pregunta | Estado | Nota |
|----------|--------|------|
| ¿Se puede rastrear un dato desde Stage 01 hasta Stage 07? | ⚠️ | Solo si se preservan IDs |
| ¿Se preservan los IDs de origen? | ⚠️ | No en todos los stages |
| ¿Se puede reconstruir el historial de transformaciones? | ❌ | No hay log de transformaciones |
| ¿Se puede identificar la fuente de cada dato? | ✅ | Stage 01 preserva source_id |

### 6.2 Trazabilidad de errores

| Pregunta | Estado | Nota |
|----------|--------|------|
| ¿Se puede identificar qué stage falló? | ✅ | Timeout y reintentos lo reportan |
| ¿Se puede identificar qué dato causó el error? | ⚠️ | No en todos los casos |
| ¿Se puede reconstruir el estado del pipeline al fallar? | ❌ | No hay snapshot de estado |
| ¿Se puede reintentar solo el stage fallido? | ❌ | Reintentos son todo-o-nada |

---

## 7. Mantenibilidad

### 7.1 Complejidad por stage

| Stage | Líneas | Complejidad | Mantenibilidad |
|-------|--------|-------------|----------------|
| 01 | ~400 | Baja | ✅ Buena |
| 02 | 1051 | Alta | ⚠️ Mejorable |
| 03 | 1301 | Muy Alta | ⚠️ Necesita refactor |
| 04 | ~800 | Media | ✅ Buena (reescrito) |
| 05 | ~500 | Media | ✅ Buena |
| 06 | 718 | Moderada | ✅ Aceptable |
| 07 | 676 | Moderada | ✅ Aceptable |

### 7.2 Deuda técnica identificada

1. **Stage 02 y 03** son los stages con mayor deuda técnica (tamaño y complejidad)
2. **Orquestación** usa `Object.assign` que mezcla claves entre stages (sin aislamiento)
3. **Artefactos** solo persisten en memoria (se pierden al reiniciar)
4. **Errores** no son uniformes (solo Stage 07 usa clases tipadas)

---

## 8. Defensa Técnica

### 8.1 Cobertura de tests

| Stage | Tests | Cobertura estimada |
|-------|-------|-------------------|
| 01 | ⚠️ | Baja |
| 02 | ⚠️ | Baja |
| 03 | ⚠️ | Baja |
| 04 | ✅ | Media (reescrito con tests) |
| 05 | ✅ | Media |
| 06 | ⚠️ | Baja |
| 07 | ⚠️ | Baja |

### 8.2 Validación de entrada/salida

| Stage | Valida entrada | Valida salida |
|-------|----------------|---------------|
| 01 | ❌ | ❌ |
| 02 | ✅ | ✅ |
| 03 | ⚠️ | ⚠️ |
| 04 | ✅ | ✅ |
| 05 | ✅ | ✅ |
| 06 | ⚠️ | ⚠️ |
| 07 | ⚠️ | ❌ |

### 8.3 Idempotencia

| Stage | Idempotente | Nota |
|-------|-------------|------|
| 01 | ⚠️ | Depende de la fuente externa |
| 02 | ✅ | Validación es determinista |
| 03 | ⚠️ | Algunas transformaciones dependen de orden |
| 04 | ✅ | Cálculos deterministas |
| 05 | ✅ | Clasificación determinista |
| 06 | ✅ | Cálculos deterministas |
| 07 | ✅ | Render determinista |

---

## 9. Riesgos Globales (Priorizados)

| # | Riesgo | Severidad | Prioridad | Impacto |
|---|--------|-----------|-----------|---------|
| G1 | `evaluation_coverage` no se propaga del Stage 04 al Stage 07 | Alta | 1 | El reporte final no refleja completitud real |
| G2 | Stage 02 es el eslabón más débil (1051 líneas, bugs conocidos) | Alta | 2 | Datos inválidos pasan al pipeline |
| G3 | GRI Oxford framework no es alcanzable (HALLAZGO-4) | Media | 3 | Cumplimiento parcial |
| G4 | Ponderación 50/50 completeness/proximity no resuelta | Media | 4 | Métricas de normalización imprecisas |
| G5 | Documentación desincronizada en Stages 06 y 07 | Media | 5 | Desarrolladores siguen docs incorrectas |
| G6 | Artefactos solo en memoria (no persisten) | Media | 6 | Pérdida de evidencia al reiniciar |
| G7 | Sin trazabilidad de transformaciones | Baja | 7 | Difícil depurar datos incorrectos |
| G8 | Tests con cobertura baja en Stages 01-03, 06-07 | Baja | 8 | Regresiones no detectadas |

---

## 10. Plan de Remediación Sugerido

### Fase 1 — Crítico (Semanas 1-2)
1. **G1:** Implementar propagación de `evaluation_coverage` al Stage 07
2. **G2:** Refactorizar Stage 02 — dividir en módulos más pequeños
3. **G5:** Sincronizar documentación de Stages 06 y 07 con código actual

### Fase 2 — Importante (Semanas 3-4)
4. **G4:** Resolver ponderación completeness/proximity con fórmula configurable
5. **G6:** Implementar persistencia de artefactos a disco (SQLite o JSON)
6. **G3:** Evaluar viabilidad de soporte GRI Oxford o documentar limitación

### Fase 3 — Mejora (Semanas 5-6)
7. **G7:** Implementar log de transformaciones para trazabilidad
8. **G8:** Incrementar cobertura de tests en stages críticos
9. **G1-G8:** Re-auditar después de implementar cambios

---

## Apéndice A: Archivos Revisados

| Archivo | Propósito |
|---------|-----------|
| `pipeline/orchestration/engine.js` | Orquestador principal (PipelineEngine) |
| `pipeline/orchestration/orchestrator.js` | Código muerto (PipelineOrchestrator) |
| `pipeline/artifact/builder.js` | EvidenceArtifactBuilder — persistencia in-memory |
| `pipeline/shared/stage-interface.js` | Clase base con wrapArtifact() |
| `pipeline/shared/types.js` | Esquemas Zod (LocationSchema, SectorEnum, etc.) |
| `pipeline/shared/errors.js` | Jerarquía de errores (solo usado por Stage 07) |
| `pipeline/stages/01-acquisition/index.js` | 10 adaptadores, dedupe en vuelo |
| `pipeline/stages/01-acquisition/registry.js` | SourceRegistry con config-loader |
| `pipeline/stages/02-validation/index.js` | 1051 líneas, stage más débil |
| `pipeline/stages/03-normalization/index.js` | 1301 líneas, ponderación 50/50 |
| `pipeline/stages/04-signals/index.js` | Reescrito completamente |
| `pipeline/stages/04-signals/confidence.js` | 630 líneas, modelado robusto |
| `pipeline/stages/05-phenomena/index.js` | 20 hallazgos cerrados |
| `pipeline/stages/06-risk/index.js` | 718 líneas, docs desincronizadas |
| `pipeline/stages/07-presentation/index.js` | 676 líneas, único con errores tipados |
| `pipeline/config/*.json` | 11 archivos de configuración |
| `server/server.js` | Punto de entrada producción |
| `server-new/routes/climate-v2.js` | Handler HTTP, POST/GET/health |

---

## Apéndice B: Convenciones de Código Detectadas

- **Lenguaje:** JavaScript (Node.js)
- **Módulos:** CommonJS (`require`/`module.exports`)
- **Validación:** Zod schemas
- **Configuración:** JSON files + config-loader con cache TTL
- **Errores:** Jerarquía personalizada (solo Stage 07 la usa)
- **Logging:** `console.log` (sin framework de logging estructurado)
- **Tests:** No determinado (no se encontraron tests en la exploración)

---

*Documento generado como auditoría adicional independiente. El documento existente (`AUDITORIA-E2E-PIPELINE-V2.md`) sirve como segundo punto de vista.*
