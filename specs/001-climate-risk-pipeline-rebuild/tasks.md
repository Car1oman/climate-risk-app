---

description: "Task list for Climate Risk Pipeline Rebuild"

---

# Tasks: Climate Risk Pipeline Rebuild

**Input**: Design documents from `specs/001-climate-risk-pipeline-rebuild/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: TDD approach — test tasks included for each stage.

**Organization**: Tasks grouped by user story. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: Maps to user story (US1-US4)
- Include exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure, dependencies, and configuration

- [ ] T001 Create parallel project directories: `pipeline/`, `server-new/`, `src-new/`, `tests-new/`
- [ ] T002 [P] Initialize Node.js project with package.json in project root (if not exists)
- [ ] T003 [P] Install Zod dependency for schema validation
- [ ] T004 [P] Create `pipeline/config/` directory with default JSON config files
- [ ] T005 Create `pipeline/config/authoritative-sources.json` — registry of 11+ sources with domain, authority level, resolution, coverage area, thresholds
- [ ] T006 Create `pipeline/config/source-quality-weights.json` — { coverage_spatial: 0.3, coverage_temporal: 0.2, completeness: 0.2, resolution: 0.2, proximity: 0.1 }
- [ ] T007 Create `pipeline/config/adaptive-capacity.json` — indicator definitions with sources and weights
- [ ] T008 Create `pipeline/config/thresholds.json` — signal activation, spatial distance, anomaly thresholds
- [ ] T009 [P] Create `pipeline/shared/types.js` — shared Zod schemas for all contracts
- [ ] T010 [P] Create `pipeline/shared/errors.js` — typed error classes per stage
- [ ] T011 [P] Create `pipeline/orchestration/engine.js` — pipeline orchestration shell

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that blocks all user stories

- [ ] T012 Create `pipeline/artifact/builder.js` — EvidenceArtifact builder with version, execution_id, stages array, final_result, narratives, rules_applied
- [ ] T013 [P] Create `pipeline/orchestration/engine.js` — pipeline runner that chains 7 stages sequentially, collects StageArtifact per stage, passes config to each stage
- [ ] T014 Create `server-new/routes/climate-v2.js` — POST endpoint that accepts { lat, lon, sector, view }, calls pipeline engine, returns response based on view level
- [ ] T015 Create `server-new/middleware/trace-logger.js` — request logging with execution_id and duration

---

## Phase 3: User Story 1 — Consultar Riesgo (Priority: P1) 🎯 MVP

**Goal**: Usuario ingresa coordenadas + sector y recibe análisis completo de riesgo climático con evidencia trazable.

**Independent Test**: Consultar coordenadas conocidas y verificar que el resultado incluya fenómenos, nivel de riesgo, fuentes y artefacto de evidencia.

### Pipeline Stages

- [ ] T016 [P] [US1] Implement Stage 01 Acquisition in `pipeline/stages/01-acquisition/` — consulta todas las fuentes en paralelo, captura errores individuales, conserva respuestas crudas
- [ ] T017 [US1] Create `pipeline/stages/01-acquisition/registry.js` — lee authoritative-sources.json, resuelve adapter por fuente
- [ ] T018 [P] [US1] Create 11 source adapters in `pipeline/stages/01-acquisition/adapters/` — uno por fuente externa (weatherapi.js, nasa-power.js, openmeteo.js, opentopodata.js, gri-oxford.js, worldbank.js, supabase.js, gracefo.js, noaa-oni.js, noaa-enso.js)
- [ ] T019 [P] [US1] Implement Stage 02 Validation in `pipeline/stages/02-validation/` — schema validation, fill value detection, spatial coverage check, distance calculation
- [ ] T020 [US1] Create `pipeline/stages/02-validation/validators/source-schemas.js` — Zod schemas para cada fuente
- [ ] T021 [US1] Create `pipeline/stages/02-validation/rules/coverage-rules.js` — clasificación por tipo (observación, proyección, geofísico, alta resolución)
- [ ] T022 [US1] Implement Stage 03 Normalization in `pipeline/stages/03-normalization/` — mapeo fuente→variable canónica, selección autoritativa, descarte de duplicados
- [ ] T023 [US1] Create `pipeline/stages/03-normalization/canonical-schema.js` — schema de variables canónicas con unidades
- [ ] T024 [US1] Create `pipeline/stages/03-normalization/mappers/` — mapeadores por fuente
- [ ] T025 [US1] Implement Stage 04 Signals in `pipeline/stages/04-signals/` — detectores de anomalía, tendencia, categorical, proyección
- [ ] T026 [US1] Create `pipeline/stages/04-signals/confidence.js` — cálculo de source_quality (5 componentes con pesos) y signal_strength
- [ ] T027 [US1] Create `pipeline/stages/04-signals/detectors/` — anomaly-detector.js, trend-detector.js, categorical-detector.js, projection-detector.js
- [ ] T028 [US1] Implement Stage 05 Phenomena in `pipeline/stages/05-phenomena/consolidator.js` — consolidación de señales en fenómenos, combinación de confianza
- [ ] T029 [US1] Implement Stage 06 Risk in `pipeline/stages/06-risk/calculator.js` — (P × I) / CA con clasificación operativo/estratégico
- [ ] T030 [US1] Create `pipeline/stages/06-risk/impact/` — evaluadores de impacto por sector
- [ ] T031 [US1] Implement Stage 07 Presentation in `pipeline/stages/07-presentation/` — proyección executive/analyst, narrativas template-based

### Tests

- [ ] T032 [P] [US1] Unit tests for each pipeline stage in `tests-new/pipeline/stages/`
- [ ] T033 [US1] Integration test — pipeline completo con Ricardo Palma fixture en `tests-new/pipeline/integration/ricardo-palma.test.js`
- [ ] T034 [US1] API test — POST /api/v2/climate-risk en `tests-new/api/climate-v2.test.js`

**Checkpoint**: US1 funcional — se puede consultar riesgo de cualquier coordenada con trazabilidad completa.

---

## Phase 4: User Story 2 — Inspeccionar Trazabilidad (Priority: P1)

**Goal**: Analista puede expandir vista de trazabilidad para ver fuentes, calidad de evidencia, fuerza de señal y reglas aplicadas.

**Independent Test**: Tomar un resultado existente, acceder a vista analista, verificar que cada afirmación tiene enlace al artefacto de evidencia.

- [ ] T035 [US2] Create `src-new/components/TraceInspector/` — componente React que muestra fuentes, señales, reglas y transformaciones
- [ ] T036 [US2] Create `src-new/components/TraceInspector/SourceList.jsx` — lista de fuentes consultadas con estado y distancia
- [ ] T037 [US2] Create `src-new/components/TraceInspector/SignalDetail.jsx` — desglose de source_quality + signal_strength por señal
- [ ] T038 [US2] Create `src-new/components/TraceInspector/RulesTimeline.jsx` — timeline visual de reglas aplicadas en cada etapa
- [ ] T039 [US2] Add `/api/v2/climate-risk/:traceId/trace` endpoint in `server-new/routes/climate-v2.js`
- [ ] T040 [US2] Create `src-new/hooks/useTraceInspection.js` — hook para obtener datos de trazabilidad
- [ ] T041 [US2] Tests in `tests-new/frontend/trace-inspector.test.js`

**Checkpoint**: US2 funcional — cada resultado tiene trazabilidad inspeccionable sin leer código.

---

## Phase 5: User Story 3 — Dashboard Ejecutivo (Priority: P2)

**Goal**: Ejecutivo ve dashboard con semáforos, resumen y recomendaciones, sin datos técnicos.

**Independent Test**: Cargar múltiples ubicaciones, verificar que el dashboard muestre solo lenguaje de negocio sin códigos ni puntajes.

- [ ] T042 [US3] Create `src-new/components/ExecutiveDashboard/` — dashboard con semáforos, indicadores y resumen
- [ ] T043 [US3] Create `src-new/components/ExecutiveDashboard/RiskSummary.jsx` — resumen ejecutivo con narrativa
- [ ] T044 [US3] Create `src-new/components/ExecutiveDashboard/PhenomenonCard.jsx` — tarjeta por fenómeno con nombre, icono y nivel
- [ ] T045 [US3] Create `src-new/components/ExecutiveDashboard/RecommendationsList.jsx` — lista de recomendaciones priorizadas
- [ ] T046 [US3] Create `src-new/pages/RiskAnalysis.jsx` — página principal que integra ExecutiveDashboard + navigación a vista analista
- [ ] T047 [US3] Create `src-new/hooks/useClimateRisk.js` — hook para query de riesgo con cache local
- [ ] T048 [US3] Tests in `tests-new/frontend/executive-dashboard.test.js`

**Checkpoint**: US3 funcional — ejecutivo puede ver resumen sin tecnicismos.

---

## Phase 6: User Story 4 — Riesgos de Transición (Priority: P3)

**Goal**: Analista de cumplimiento consulta riesgos regulatorios, de mercado, tecnológicos y reputacionales.

**Independent Test**: Consultar sector retail/financiero y verificar que aparezcan riesgos de transición.

- [ ] T049 [US4] Add transition risk signals to `pipeline/stages/04-signals/detectors/transition-risk-detector.js`
- [ ] T050 [US4] Add sector profiles for transition risks in `pipeline/config/sector-profiles.json`
- [ ] T051 [US4] Extend stage 06 risk calculator with transition risk evaluation
- [ ] T052 [US4] Extend stage 07 presentation to include transition risks in analyst view
- [ ] T053 [US4] Tests in `tests-new/pipeline/stages/transition-risks.test.js`

**Checkpoint**: US4 funcional — riesgos de transición disponibles para sectores relevantes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T054 [P] Add Ricardo Palma test fixture data in `tests-new/pipeline/fixtures/ricardo-palma/`
- [ ] T055 [P] Add documentation in `specs/001-climate-risk-pipeline-rebuild/` for each stage
- [ ] T056 Update pipeline configuration defaults after validation with real data
- [ ] T057 Run full quickstart validation scenarios from `quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all stories
- **US1 (Phase 3)**: Depends on Foundational — MVP target
- **US2 (Phase 4)**: Depends on US1 (needs pipeline + evidence artifact)
- **US3 (Phase 5)**: Depends on US1 (needs pipeline results)
- **US4 (Phase 6)**: Depends on US1 pipeline (adds transition signals)
- **Polish (Phase 7)**: After all user stories

### Parallel Opportunities

- T002–T011: All setup tasks can run in parallel
- T016–T034: US1 pipeline stages can be built in parallel once contracts are clear
- US1 (Phase 3) blocks everything — recommended as sole MVP focus
- US2 + US3 can be built in parallel after US1 is complete
- US4 can be built independently after US1 signal layer exists

### Implementation Strategy

**MVP First (US1 only)**:
1. Phase 1 + 2: Setup & Foundational
2. Phase 3: All pipeline stages (T016–T034)
3. **STOP and VALIDATE**: Test US1 end-to-end with Ricardo Palma
4. US2–US4 delivered incrementally after MVP validation
