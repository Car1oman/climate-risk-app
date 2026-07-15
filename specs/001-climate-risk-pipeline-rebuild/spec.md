# Feature Specification: Climate Risk Pipeline Rebuild

**Feature Branch**: `001-climate-risk-pipeline-rebuild`

**Created**: 2026-06-22

**Status**: Draft

**Input**: Reconstrucción paralela trazable de la plataforma de riesgos climáticos, basada en el sistema actual como referencia funcional pero con arquitectura desacoplada, contratos E/S explícitos, artefactos persistibles, validación en cada etapa, y trazabilidad completa.

## User Scenarios & Testing

### User Story 1 — Consultar riesgo climático de una ubicación (Priority: P1)

Un analista de sostenibilidad ingresa coordenadas y recibe un análisis completo de riesgos climáticos: fenómenos identificados, nivel de exposición, impactos potenciales y recomendaciones. El sistema procesa fuentes climáticas, genera señales, evalúa riesgos y produce una narrativa explicativa.

**Why this priority**: Es el caso de uso primario del sistema actual. Sin este flujo completo la plataforma no entrega valor.

**Independent Test**: Puede probarse consultando una ubicación conocida y verificando que el resultado incluya fenómenos, nivel de riesgo, fuentes y narrativa.

**Acceptance Scenarios**:

1. **Given** coordenadas válidas y un sector económico, **When** el usuario ejecuta la consulta, **Then** el sistema devuelve un análisis estructurado con fenómenos identificados, nivel de riesgo y recomendaciones.
2. **Given** coordenadas fuera del área de cobertura de una fuente, **When** el pipeline procesa la ubicación, **Then** el resultado indica "sin cobertura" para esa fuente pero continúa con las demás fuentes disponibles.
3. **Given** coordenadas con cobertura parcial (algunas fuentes disponibles, otras no), **When** se completa el pipeline, **Then** el artefacto de evidencia registra exactamente qué fuentes contribuyeron y cuáles no.

---

### User Story 2 — Inspeccionar trazabilidad de un resultado (Priority: P1)

Un analista de riesgos o auditor necesita entender por qué el sistema determinó un nivel de riesgo específico. Desde el dashboard puede expandir una vista de trazabilidad que muestra: fuentes utilizadas, calidad de evidencia, fuerza de señal, reglas aplicadas y transformaciones intermedias.

**Why this priority**: La trazabilidad es el pilar arquitectónico central del nuevo diseño. Sin ella, el sistema es una caja negra como el actual.

**Independent Test**: Puede probarse tomando un resultado con riesgo "alto" y verificando que la cadena de evidencia muestre cada transformación desde la fuente hasta la conclusión.

**Acceptance Scenarios**:

1. **Given** un resultado de riesgo climático, **When** el analista accede a la vista de trazabilidad, **Then** ve la fuente autoritativa de cada variable, la distancia espacial (si aplica), la calidad de evidencia, y la fuerza de señal.
2. **Given** un resultado con confianza "alta", **When** se inspecciona la trazabilidad, **Then** se muestran los componentes source_quality (0-1) y signal_strength (0-1) por separado, y la regla que derivó la clasificación final.
3. **Given** una coordenada donde se usó interpolación o vecino más cercano, **When** se revisa la trazabilidad, **Then** se registra el método usado, la distancia, y cómo afectó la calidad de evidencia.

---

### User Story 3 — Revisar dashboard ejecutivo de riesgos (Priority: P2)

Un gerente de sostenibilidad o director de operaciones accede a un dashboard que resume los riesgos climáticos de las ubicaciones de su empresa: semáforos por nivel de riesgo, fenómenos más relevantes, resumen ejecutivo y recomendaciones priorizadas.

**Why this priority**: Los tomadores de decisión necesitan una vista consolidada sin tecnicismos.

**Independent Test**: Puede probarse cargando múltiples ubicaciones y verificando que el dashboard muestre resúmenes ejecutivos sin variables técnicas visibles.

**Acceptance Scenarios**:

1. **Given** múltiples ubicaciones analizadas, **When** el ejecutivo abre el dashboard, **Then** ve una vista con semáforos (riesgo bajo/medio/alto), fenómenos principales y recomendaciones.
2. **Given** un elemento del dashboard, **When** el ejecutivo hace clic en "ver detalle", **Then** NO se muestran variables técnicas — solo narrativa ampliada e impactos potenciales en lenguaje de negocio.

---

### User Story 4 — Consultar riesgos de transición (regulatorios, mercado) (Priority: P3)

Un analista de cumplimiento normativo consulta riesgos de transición para una ubicación o para el negocio en general: exposición regulatoria (IFRS S2, taxonomías verdes), riesgos de mercado y reputacionales.

**Why this priority**: El manual de adaptación dedica sección completa a riesgos de transición. Aunque secundario frente a riesgos físicos, es necesario para cumplimiento IFRS S2.

**Independent Test**: Puede probarse consultando un sector (e.g., retail financiero) y verificando que aparezcan riesgos regulatorios y de mercado.

**Acceptance Scenarios**:

1. **Given** un sector económico y ubicación, **When** se consultan riesgos de transición, **Then** se muestran riesgos regulatorios, de mercado, tecnológicos y reputacionales relevantes para ese sector.

---

### Edge Cases

- Coordenadas oceánicas o sin cobertura de ninguna fuente → el pipeline completa con "sin cobertura" y no genera valores sintéticos.
- Fuente externa devuelve error (timeout, 500) → el pipeline registra el fallo, continúa con fuentes restantes, y el artefacto de evidencia muestra la fuente como "no disponible".
- Conflicto entre fuente autoritativa y complementaria → se usa la autoritativa; la complementaria se conserva en trazabilidad como validación.
- Umbral de distancia superado para vecino más cercano → fuente se clasifica como "sin cobertura", no se genera valor aproximado.
- Todos los servicios externos fallan → el pipeline retorna un resultado vacío con todos los errores registrados en trazabilidad.

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept geographic coordinates (lat, lon) and return a structured climate risk analysis.
- **FR-002**: System MUST maintain a registry of authoritative sources per domain (observation, reanalysis, projection, geophysical, ENSO, precomputed risk).
- **FR-003**: For each variable, the system MUST use exactly one authoritative source as primary; other sources MUST be retained as complementary evidence.
- **FR-004**: System MUST NOT perform automatic weighted averaging or statistical fusion of values from different sources unless explicit scientific justification exists for that specific variable.
- **FR-005**: System MUST compute risk using the formula: Risk Score = (Probability × Impact) / Adaptive Capacity, with all three components independently traceable.
- **FR-006**: System MUST compute confidence as two independent dimensions: source_quality (0-1) and signal_strength (0-1), derived from explicit sub-metrics.
- **FR-007**: System MUST persist an evidence artifact for every pipeline execution containing: sources consulted, signals detected, rules applied, transformations, and final result with full traceability.
- **FR-008**: System MUST distinguish between "data not available" (source lacks coverage) and "data approximable" (nearest grid point or interpolation used), with different treatment per data type.
- **FR-009**: System MUST record spatial distance between requested coordinates and actual data point used, and penalize source_quality when distance exceeds defined thresholds.
- **FR-010**: System MUST NOT generate synthetic values for locations with no real coverage.
- **FR-011**: System MUST support two visualization levels on the same data: Executive view (plain language, summaries, recommendations) and Analyst view (scenarios, confidence, sources, traceability).
- **FR-012**: System MUST NOT expose raw JSON, API responses, variable codes, or scientific notation in any user-facing view.
- **FR-013**: System MUST handle partial service failures: if one source fails, the pipeline continues with remaining sources and records the failure in the evidence artifact.
- **FR-014**: System MUST support querying by sector/industry to map climate signals to business impacts relevant to that sector.
- **FR-015**: System MUST support the dual-scenario approach (≤2°C transition and >2°C high emissions) for climate projections.
- **FR-016**: System MUST classify risks as operational (materializing in ≤10 years) vs strategic (materializing >10 years).

### Key Entities

- **Location**: Geographic point (lat, lon) for which risk is analyzed. May include elevation and context (urban/rural, watershed).
- **Climate Source**: External data provider with defined domain, resolution, coverage area, update frequency, and authority level (primary vs complementary).
- **Observation Variable**: Raw climate measurement (temperature, precipitation, wind, humidity) from an observation or reanalysis source.
- **Projection Variable**: Future climate variable from CMIP6 models under a specific SSP scenario and time horizon.
- **Geophysical Variable**: Terrain, water storage, or exposure data (elevation, GRACE-FO groundwater, flood risk maps).
- **Climate Signal**: Anomaly or detected pattern derived from comparing observations/projections against historical baselines. Carries source_quality and signal_strength.
- **Business Impact**: Operational consequence of a climate signal on a specific sector/activity (logistics disruption, increased cooling costs, crop failure).
- **Risk Assessment**: Evaluated risk combining probability, impact, adaptive capacity, and scenario/horizon context.
- **Adaptation Measure**: Recommended action to reduce vulnerability, with urgency, feasibility, co-benefits, and risk reduction rating.
- **Evidence Artifact**: Complete traceability record of one pipeline execution. Contains all inputs, intermediate values, transformations, and decisions. Can be inspected independently of any UI.
- **Sector Profile**: Predefined mapping of climate signals to business impacts for a given economic sector (retail, agriculture, finance, education, etc.).

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can obtain a complete climate risk analysis with evidence artifact for any coordinate in under 60 seconds.
- **SC-002**: Every risk result includes a traceable evidence path from source to conclusion that can be inspected without reading code.
- **SC-003**: Analysts can determine the exact source and spatial distance for every data point in under 3 clicks.
- **SC-004**: Executive dashboard shows zero technical variable names, JSON structures, or API error codes.
- **SC-005**: Pipeline continues and produces partial results when up to 30% of sources are unavailable.
- **SC-006**: Evidence artifacts are self-contained and interpretable by a domain expert without access to the platform UI.

## Assumptions

- The existing system (`server/routes/climate.js`, `server/layers/*`, `server/services/*`) is the functional reference; new code lives in a parallel structure.
- The authoritative source registry is defined at deployment time and can be updated without code changes.
- Coordinates outside all source coverage areas return "no data" with no synthetic generation.
- The risk formula (P × I) / CA from the adaptation manual is the canonical model; IPCC AR6 full framework may be adopted in a future version.
- Executive users have no climate science background; analyst users understand basic climate risk concepts (scenarios, probability, impact).
- All external climate APIs are treated as unreliable; validation and error handling are mandatory at every integration point.
- The evidence artifact format is JSON; it is stored for auditing and debugging purposes with a defined retention policy.
