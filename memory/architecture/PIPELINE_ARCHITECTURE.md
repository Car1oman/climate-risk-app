# PIPELINE ARCHITECTURE — 9 Capas Semánticas

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §Fase 3  
**Status:** Especificado; implementación parcial (capas 1-6 del sistema legacy corresponden aproximadamente a este modelo)

---

## Diagrama de capas (target)

```
Ingestion: climate_cells (Supabase CMIP6) + GRI Oxford + Open-Meteo (fallback)
    ↓
Layer 1: CLIMATE SIGNAL DETECTION
  Output: ClimateSignal[] {hazardId, horizon, scenario, value, unit, p10, p90, nModels, rawConfidence, dataSource}
  Regla: Solo detecta señales físicas. No interpreta. No conoce sectores.
    ↓
Layer 2: HAZARD CLASSIFICATION
  Output: ClassifiedHazard[] {hazardId, displayType, horizon, intensity, frequency, trendDirection}
  Regla: Clasifica y agrupa. Aplica compound detection. Umbrales por región.
  SINGLE SOURCE OF TRUTH para intensidad.
    ↓
Layer 3: CONFIDENCE ATTRIBUTION
  Output: AnnotatedHazard[] {confidence, confidenceRationale, uncertaintyRange, sources[]}
  Reglas: baseline→high, temperatura near/mid→high, precipitación near/mid→low, end_century→max low
    ↓
Layer 4: TEMPORAL ORGANIZATION
  Output: HazardTimeline {baseline[], near_term:{ssp245,ssp585}, mid_century:{...}, end_century:{...}}
  Regla: SINGLE SOURCE OF TRUTH para estructura temporal.
    ↓
Layer 5: SECTOR EXPOSURE MAPPING
  Output: ExposureMatrix[] {hazardId, displayType, horizon, exposureType, impactDomain, impactDescription}
  Regla: Conecta hazards con sectores. Sin valores financieros.
    ↓
Layer 6: OPERATIONAL IMPACT INTERPRETATION
  Output: OperationalImpact[] {narrativeText, impactBullets[], adaptationMeasures[], scenarioVariants}
  Regla: SINGLE NARRATIVE SYSTEM. Reemplaza sanitizeNarrative + buildOperationalNarrative.
    ↓
Layer 7: EXECUTIVE NARRATIVE ASSEMBLY
  Output: ExecutiveNarrative {executiveSummary, horizons{}, primaryHazards[], scenarioDelta, governance}
  Regla: Ensambla. No interpreta datos. No convierte unidades.
    ↓
Layer 8: AI ENRICHMENT (opcional, con guardrails)
  Output: EnrichedNarrative | ExecutiveNarrative (fallback)
  Regla: IA recibe contexto completo. No puede contradecir confidence del pipeline.
    ↓
Layer 9: UI RENDERING
  Output: React component tree
  Regla ABSOLUTA: Componentes NO hacen transformación de datos. Props = typed display data.
```

---

## Estado actual (qué existe vs qué falta)

| Capa objetivo | Archivo legacy equivalente | Gap |
|---------------|---------------------------|-----|
| Signal Detection | `Layer1_ClimateDataFusion.js` + `Layer2_SignalEngine.js` | Usa `ClimateSignal` pero sin `HazardId` nuevo |
| Hazard Classification | Parte de `Layer2_SignalEngine.js` + `Layer3_BusinessRiskEngine.js` | Sin separación hazard/classification |
| Confidence Attribution | Parcial en `governance.js` | Sin `ConfidenceEngine` unificado |
| Temporal Organization | `PERIOD_MAPS` fragmentados en múltiples archivos | Sin `HORIZON_REGISTRY` unificado |
| Sector Exposure Mapping | `Layer3_BusinessRiskEngine.js` | OK aproximado, falta `HazardId` granular |
| Impact Interpretation | `buildOperationalNarrative.ts` + `sanitizeNarrative.ts` | Dos sistemas compitiendo (deuda P1.7) |
| Narrative Assembly | `buildNarrativeReport.ts` | OK estructura, falta `ExecutiveNarrative` tipado |
| AI Enrichment | `server/routes/ai.js` | Sin system prompt, sin validador (P0.1-0.3) |
| UI Rendering | `src/features/climate-lookup/` | Sin TypeScript (P0.4), sin near_term tab (P0.6) |

---

## Ownership semántico (qué NO hace cada capa)

- Signal Detection: NO interpreta impactos, NO genera texto, NO conoce sectores
- Hazard Classification: NO produce narrativa, NO asigna confianza final
- Confidence Attribution: NO usa juicio subjetivo ni promedios incorrectos
- Temporal Organization: NO genera texto, NO normaliza slugs
- Exposure Mapping: NO inventa impactos sin evidencia
- Impact Interpretation: NO genera números financieros, NO usa jerga IPCC
- Narrative Assembly: NO accede a datos raw, NO hace cálculos
- AI Enrichment: NO contradice pipeline, NO inventa datos
- UI Rendering: NO transforma datos, NO tiene lógica de negocio

---

## Datos de entrada del sistema

```
climate_cells (Supabase)
  └── RPC: get_nearest_climate_cell
  └── CMIP6 horizons: baseline(1981-2014), SSP245/585_(2020-2039), SSP245/585_(2040-2059)
  └── Variables: tas, tasmax, tasmin, pr, rx1day, cdd, cwd (fd/tr inferidos)

GRI Oxford API
  └── ~1km resolution, scores cualitativos alto/medio/bajo
  └── Hazards: heat, precipitation, fluvial, coastal, drought, etc.

Open-Meteo (fallback)
  └── Índices climáticos derivados
  └── Confianza = 'low', sin percentiles p10/p90
```
