Auditoría Estructural de 10 Capas — Platforma de Riesgo Climático
Hallazgo Transversal #1 (Crítico)
La plataforma tiene 3 modelos temporales contradictorios que coexisten:
Modelo	Backend (climate.js:417-431)	Frontend (scenarios.ts:79-88)	Ciencia real CMIP6
Corto plazo	2020-2039 (19 años)	corto_plazo → 2020-2039	2021-2040 (media multi-decadal)
Mediano plazo	2040-2059 (19 años)	mediano_plazo → 2040-2059	2041-2060 (media multi-decadal)
Largo plazo	No existe en Layer2	largo_plazo → 2060-2080	2081-2100
Ningún modelo coincide con 0-5 / 5-10 años del usuario. La plataforma etiqueta ventanas de 19 años como "corto plazo".
Hallazgo Transversal #2 (Crítico)
corto_plazo es una huérfana semántica. HORIZON_TO_PERIOD mapea short_term→corto_plazo, pero:
- ClimateRiskLookup.jsx:113-124 solo filtra historico, mediano_plazo, largo_plazo
- RiskPeriodTabs.jsx:5-9 solo define tabs para esos 3 períodos
- Las señales de short_term existen en datos, son normalizadas a corto_plazo, y luego invisibilizadas
Layer 1 — Definición de Producto
Lo que hace
Aplicación web para análisis de riesgo climático de activos comerciales peruanos. Input: coordenadas + sector. Output: resumen ejecutivo + timeline + medidas de adaptación.
Hallazgos
1. No hay unidad de análisis explícita. El README dice "asset-level" pero la API solo recibe lat/lon + sector. No hay concepto de facility_id, building_footprint, o portafolio.
2. No hay autenticación multi-tenant. GET /api/climate-risks/lookup no requiere auth (climate.js:373); POST /v2/climate-risk-analysis sí (line 635).
3. Sectores hardcodeados en 5 grupos (retail, educacion, salud, entretenimiento, otros). No hay API para extender.
4. No hay historial de análisis por usuario — cada request es independiente.
Riesgo
La plataforma escala a portafolio sin modelo de datos multi-asset.
Layer 2 — Entidades Core
Modelo actual
API Response (json)
├── signals[]        ← Layer2: señales climáticas detectadas
├── risks[]          ← Layer3: impactos operacionales
├── adaptations[]    ← Layer5: medidas de adaptación
├── projections      ← Layer9: proyección científica
├── narrative        ← Layer6: resumen ejecutivo
├── gri_hazards[]    ← GRI Oxford
└── territorial      ← World Bank
Modelo normalizado (frontend)
ConsolidatedRisk[]  ← deduplicado por (riskType × period)
  └── ConsolidatedRiskTimeline[]  ← agrupado por riskType
Hallazgos
1. 7 risk types (lluvias_extremas, calor_extremo, sequia, deslizamiento, heladas, fenomeno_enso, inundacion) — cobertura completa de fenómenos peruanos.
2. flood y fluvial de GRI mapean a distintos slugs (lluvias_extremas vs inundacion) — semántica inconsistente: ¿inundación es un subtipo de lluvia o un riesgo separado?
3. heladas no tiene detección en Layer2 — no hay umbrales de helada ni señales de Tmin. Existe en el display pero nunca se genera.
4. fenomeno_enso es informacional (no proyección) — correcto para ENSO observacional, pero no hay proyección ENSO bajo cambio climático.
Layer 3 — Datos Climáticos
Pipeline de datos
Supabase (climate_cells, JSONB) → RPC get_nearest_climate_cell
  └── historical: 1981-2014 (CMIP6 baseline)
  └── ensemble-all-ssp245_2020-2039
  └── ensemble-all-ssp245_2040-2059
  └── ensemble-all-ssp585_2020-2039
  └── ensemble-all-ssp585_2040-2059
Hallazgos
1. Solo 2 horizontes temporales en DB (2020-2039, 2040-2059) para proyecciones. No existe 2060-2079 o 2080-2100 en la tabla climate_cells.
2. Layer9 (projection.js) usa datos hardcodeados IPCC AR6 (no de la DB) para el horizonte far_term (2060-2079). Genera narrativas científicas con valores fijos para Perú.
3. Open-Meteo como fallback — getClimateTrends() provee índices climáticos derivados cuando climate_cells no está disponible. Confianza degradada a low.
4. GRI Oxford es la única fuente con resolución < 25km (~1km). Se usa cualitativamente (scores alto/medio/bajo).
5. No hay datos observacionales meteorológicos (SENAMHI) para validación cruzada de línea base histórica.
Riesgo
Si climate_cells no tiene datos para una ubicación, Open-Meteo es un proxy con confianza baja y sin percentiles (p10/p90).
Layer 4 — Semántica Temporal (hallazgo más crítico)
Mapeo actual completo
Origen	Clave API	Periodo real CMIP6	Etiq. Frontend	Años
DB	historical	1981-2014 (observado)	historico	33
DB	ensemble-all-sspX_2020-2039	Media multi-modelo 2020-2039	corto_plazo	19
DB	ensemble-all-sspX_2040-2059	Media multi-modelo 2040-2059	mediano_plazo	19
Layer9	N/A (hardcodeado)	IPCC AR6 2060-2079	largo_plazo	19
DB	No existe	2081-2100	No usado	19
DB	No existe	DCPP (1-10 años)	No usado	1-10
Problemas
1. 19 años NO es "corto plazo" para ningún estándar climático o de negocio.
2. largo_plazo (2060-2079) no tiene datos reales en la DB — solo narrativa IPCC hardcodeada en projection.js.
3. No hay ventana 0-5 años ni 5-10 años. La decisión de no usar DCPP (Decadal Climate Prediction Project) es una limitación arquitectónica.
4. TIME_WINDOWS_UI.scenarios.ts:57 dice corto_plazo.description = 'Próxima década' pero el periodo real es 2020-2039 (19 años). Descripción engañosa.
Recomendación
Renombrar el modelo temporal de la plataforma para reflejar la realidad CMIP6:
- corto_plazo → cercano (2020-2039)
- mediano_plazo → medio_siglo (2040-2059)
- largo_plazo → final_siglo (2060-2079)
- Agregar advertencia UX: "Las proyecciones CMIP6 representan promedios multi-decadales, no predicciones año a año"
Layer 5 — Ontología de Riesgo
Modelo H×E×I (Hazard × Exposure × Vulnerability)
Enunciado en docs/SCIENTIFIC_METHOD.md pero no implementado en el pipeline de datos:
- Layer2 detecta hazards (señales físicas)
- Layer3 mapea a impactos operacionales por sector (≈ exposure)
- No hay componente de vulnerability (características del activo)
- No hay multiplicación H×E×I — no hay score numérico de riesgo
Flujo real
Señal climática → Impacto operacional textual → Narrativa resumen
Los "riesgos" son descriptivos, no cuantitativos. Esto es correcto para la postura "descriptive, not prescriptive" del SCIENTIFIC_METHOD.md (línea 295).
Hallazgos
1. SIGNAL_TO_CONSOLIDATED mapea extreme_heat, severe_heat, tropical_nights, temp_increase → calor_extremo. Esto fusiona 4 fenómenos distintos en 1. Correcto para UX pero borra distinciones científicas importantes (ej: noches tropicales es distinto a calor diurno extremo para impacto en cadena de frío).
2. flood_risk mapea a lluvias_extremas pero inundación costera no requiere lluvia. Confusión ontológica.
3. No hay taxonomía de impacto — los impactos operacionales son strings hardcodeados en OPERATIONAL_IMPACTS (Layer3), no entidades referenciables.
Layer 6 — Narrativa y UX
Pipeline de narrativa
Layer9 (projection.js:187-222) → texto científico con IPCC codes
  → sanitizeNarrative.ts (reemplaza términos técnicos)
  → buildOperationalNarrative.ts (genera texto ejecutivo)
  → buildNarrativeReport.ts (ensambla NarrativeReport final)
Hallazgos
1. Dos sistemas narrativos compiten: buildOperationalNarrative.ts (Sprint 18) genera texto limpio sin códigos técnicos. Pero sanitizeNarrative.ts (Sprint 21) aplica regex replacements sobre el texto de Layer9 para limpiarlo. ¿Cuál gana? La respuesta es: buildNarrativeReport.ts llama a buildOperationalNarrative directamente, y sanitizeNarrative se usa para textos raw de Layer9. Hay traslape no resuelto.
2. buildExecutiveSummary (normalizeRisks.ts:492-524) está deprecada pero el código sigue presente. Marca @deprecated pero nadie la eliminó.
3. GRI_HAZARD_LABELS (Layer6_NarrativeEngine.js:14-25) duplica labels que existen en RISK_TYPE_DISPLAY (riskTypes.ts). fluvial → 'inundación fluvial' pero en normalizeRisks.ts fluvial → inundacion. Inconsistencia.
4. La narrativa no diferencia entre escenarios en el nivel ejecutivo. Solo ExecutiveSummaryCard usa activeScenario para impactos vía scenarioVariants.
Layer 7 — Semántica Frontend
Archivos con @ts-nocheck
- ClimateRiskLookup.jsx — página principal
- RiskPeriodTabs.jsx — tabs de período
- ExecutiveSummaryCard.jsx — tarjeta ejecutiva
3 archivos críticos del UI tienen TypeScript deshabilitado.
Hallazgos de UI
1. RiskPeriodTabs.jsx:5-9 — PERIOD_TABS hardcodeado con 3 entradas. Omite corto_plazo. Si se agrega, funciona inmediatamente porque normalizeRisks.ts ya produce entradas con period: 'corto_plazo'.
2. ClimateRiskLookup.jsx:113-124 — Solo define 3 arrays filtrados. corto_plazo no tiene slot.
3. ExecutiveSummaryCard.jsx:11-15 — PERIOD_NARRATIVE_KEY no tiene entrada para corto_plazo. Causa undefined → fallback a executiveSummary.
4. useClimateAnalysis.js — Hook bien diseñado, separación limpia UI/datos. Sin embargo, no maneja selección de escenario en el fetch — el escenario se selecciona post-hoc en el frontend.
5. activeScenario se pasa como prop a través de 3 componentes (ExecutiveSummaryCard, RiskPeriodTabs → RiskPeriodSection). Sin contexto de escenario. Escalable pero tedioso.
Bug confirmado
Si Layer2 produce señal short_term con horizon: 'short_term', el flujo es:
normalizeRisks.ts → HORIZON_TO_PERIOD → 'corto_plazo'
→ consolidatedRisk.period = 'corto_plazo'
→ ClimateRiskLookup.jsx: consolidatedRisks contiene entries con period='corto_plazo'
→ Pero nadie las filtra ni las muestra
→ Son datos fantasma
Layer 8 — Semántica Backend
API Endpoints
Endpoint	Capa	Auth	Cache
GET /api/climate	Open-Meteo en vivo	No	5 min
GET /api/climate-cells/query	climate_cells + interpretación	No	5 min
GET /api/climate-risks/lookup	climate_cells raw + periodos	No	No
GET /api/external-risks/lookup	GRI Oxford	No	5 min
POST /api/climate-cells/upload	ETL	Auth + rate limit	No
POST /v2/climate-risk-analysis Pipeline completo (6 capas)	Auth	No	No
POST /api/ai	Gemini	Auth + rate limit	No
Hallazgos
1. /api/climate-risks/lookup (climate.js:417-431) tiene su propio PERIOD_MAPS inline que NO coincide con el resto del sistema. horizons devueltos son ['historico', 'corto', 'mediano'] — no ['historico', 'corto_plazo', 'mediano_plazo'].
2. climateGeospatialService.js (línea 1-7) se marca como LEGACY con .from().rpc() incorrecto. Pero /api/climate-cells/query aún lo importa.
3. extractClimatePeriod (climate.js:74-87) usa classifyRiskLevel basado en umbrales absolutos (ej: txx > 38°C = alto). Esto duplica lógica de Layer2. No hay single source of truth para clasificación.
4. buildHorizonMap (Layer1.js:31-38) solo mapea 3 keys: historical, 2020-2039, 2040-2059. No hay long_term.
Layer 9 — Generación IA (Gemini)
Implementación actual
- POST /api/ai en server/routes/ai.js
- Usa @google/genai SDK con fallback: gemini-2.5-flash → gemini-1.5-flash
- Sin GEMINI_API_KEY → respuesta de demostración hardcodeada
Hallazgos
1. No hay system prompt. El endpoint solo pasa contents: prompt — sin instrucciones de sistema, sin contexto científico, sin restricciones de contenido.
2. No hay validación de respuesta. El texto de Gemini se envía directamente al cliente. Sin verificación de:
- Alucinaciones climáticas
- Scores financieros inventados
- Lenguaje de urgencia
- Citas IPCC falsas
3. No hay contexto de datos reales. Gemini recibe solo el prompt del usuario, no los resultados del pipeline de 6 capas. La IA no sabe qué señales detectó Layer2.
4. Sin rate limiting granular. Usa aiLimiter genérico — sin diferenciación entre usuarios gratuitos vs premium.
5. Respuesta demo hardcodeada (líneas 41-54) contiene lenguaje de impacto que viola SCIENTIFIC_METHOD.md: "Impactos operacionales más probables" y "Acciones recomendadas" — la política dice que la plataforma es descriptiva, no prescriptiva.
Riesgo reputacional
Gemini sin guardrails puede generar: proyecciones numéricas falsas, códigos SSP que el sanitizador no captura, o lenguaje de "emergencia climática" que viola la política científica de la plataforma.
Layer 10 — Integridad Científica
Lo que está bien
1. projection.js usa datos IPCC AR6 reales con medianas, p10, p90, número de modelos, y etiquetas de confianza. Fuente: "IPCC AR6 WGI Atlas — Región SAM / Ensamble CMIP6".
2. governance.js tiene trazabilidad, descargos, y sistema de referencias por señal.
3. domain.js tiene taxonomía de señales y registro de evidencia.
4. historical.js documenta eventos observados con validación de umbral (exceeds_threshold), autoridad, fecha, y referencia.
5. Policy explícita (SCIENTIFIC_METHOD.md:295): "descriptive, not prescriptive".
Lo que está mal
1. projection.js:58-81 — TIME_WINDOWS define near_term: 2020-2039 con description "IPCC AR6 — near-term: 2021-2040". Pero IPCC AR6 near-term es 2021-2040 (20 años), no 2020-2039 (19 años). Diferencia menor pero indica desalineación.
2. projection.js:74-79 — far_term description dice "IPCC AR6 — long-term extrapolado a 2060-2079". IPCC AR6 long-term es 2081-2100. 2060-2079 es una extrapolación propia de la plataforma no respaldada por el AR6.
3. projection.js PROJECTION_DATA usa región "SAM" (South America) para todo Perú. Perú tiene 3 regiones climáticas (costa, sierra, selva) con señales muy distintas. Un ensemble para todo SAM puede no representar bien la sierra peruana.
4. PROJECTION_DATA.precipitation_change tiene confidence: 'low' para todas las ventanas. Correcto — pero la UI muestra "confianza media" agregada (projection.js:277).
5. Layer2 usa umbrales discretos (EXTREME_HEAT_SHORT: 10 días). No hay curva continua de riesgo. 9.9 días no genera señal; 10.1 días sí. Esto puede dar falsa sensación de precisión.
6. No hay ensemble spread en la UI ejecutiva. p10/p90 existen en datos y en projection.js pero no llegan al ExecutiveSummaryCard. El usuario ve solo la mediana.
Riesgos científicos
1. La precipitación en los Andes tiene confianza baja pero la UI trata todas las señales con el mismo peso visual.
2. Los umbrales de Layer2 son fijos para todo Perú — un asset en la costa norte (lluviosa) vs sierra sur (árida) deberían tener umbrales diferentes.
3. Proyecciones a 2060-2079 sin datos CMIP6 reales en la DB — la narrativa IPCC hardcodeada no está ligada a la celda climática real.
Resumen de Prioridades
Prioridad	Hallazgo	Impacto	Acción
🔴 P0	corto_plazo invisible en UI	Datos de corto plazo existen pero no se muestran	Agregar corto_plazo a PERIOD_TABS y ClimateRiskLookup filters
🔴 P0	@ts-nocheck en 3 archivos críticos	Sin type safety en componentes principales	Eliminar @ts-nocheck, tipar correctamente
🔴 P0	Gemini sin system prompt ni validación	Riesgo de alucinaciones climáticas con daño reputacional	Agregar system prompt con restricciones y validación post-generación
🟠 P1	19 años etiquetado como "corto plazo"	Engañoso para usuarios de negocio	Renombrar periodos o agregar nota aclaratoria UX
🟠 P1	far_term (2060-2079) sin datos reales en DB	Narrativa desacoplada de la celda climática	Cargar 2060-2079 en climate_cells o deshabilitar largo_plazo
🟠 P1	Layer2 no detecta heladas	Riesgo existe en ontología pero nunca se activa	Agregar umbrales de Tmin/helada
🟡 P2	Sin componente de vulnerabilidad H×E×I	Modelo científico incompleto	Evaluar si es necesario para roadmap de producto
🟡 P2	Duplicación de lógica de clasificación	classifyRiskLevel vs Layer2 thresholds	Unificar en un servicio
🟡 P2	buildExecutiveSummary deprecada pero presente	Dead code	Eliminar después de verificar tests
🔵 P3	Sin DCPP (0-10 años)	Brecha en cobertura temporal	Evaluar roadmap para decadal predictions
🔵 P3	Perú = 1 región climática en projection.js	Pérdida de precisión regional	Segmentar por macro-regiones