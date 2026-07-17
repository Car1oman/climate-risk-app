# Stage 07 — Presentation

## Propósito

Transformar las evaluaciones de riesgo de Stage 6 en una vista proyectada para UI (executive o analyst). Consolida múltiples assessments en un riesgo global, genera narrativa ejecutiva con trazabilidad a evidencia, produce recomendaciones personalizadas por fenómeno×sector, y calcula una nota de confianza basada en confidence.combined de los fenómenos evaluados. No realiza cálculos analíticos de riesgo — hereda los scores de Stage 6 y los presentationa con contexto, semántica y trazabilidad.

## Arquitectura del stage

```
index.js (Stage07Presentation)
│
├─ async execute(rawInput)
│   ├─ PASO 1: Validación de Input                    → validateInput()
│   │   └─ PresentationInputSchema.safeParse()        ← types.js (Zod)
│   │
│   ├─ PASO 2: Consolidación de Riesgo Global         → calculateOverallRisk()
│   │   ├─ max-risk (worst-case conservador)          ← COSO ERM §4.3, ISO 31000 §6.6
│   │   ├─ risk_composite (promedio igual-ponderado)  ← Laplace/máxima entropía
│   │   ├─ risk_count (tally bajo/medio/alto/cat.)    ← contexto de concentración
│   │   └─ classifyCompositeRisk()                    ← reusa low_max/medium_max
│   │
│   ├─ PASO 3: Formateo de Fenómenos                  → formatPhenomenonName(), formatStatus()
│   │   ├─ display_names desde phenomenon-definitions  ← H-7.6, fuentes WMO/SENAMHI/INDECI
│   │   └─ getRiskContribution()                      ← score + score_scale [min,max,formula]
│   │
│   ├─ PASO 4: Generación de Recomendaciones          → buildRecommendations()
│   │   ├─ lookupPhysicalMeasure()                    ← adaptation-measures.json (Anexo 10.2)
│   │   ├─ lookupTransitionMeasure()                  ← adaptation-measures.json
│   │   ├─ Priorización por risk_score_raw descendente ← H-7.3 punto #5
│   │   └─ Capas: MAX_PHYSICAL=3, MAX_TRANSITION=2    ← límite editorial documentado
│   │
│   ├─ PASO 5: Nota de Confianza                      → buildConfidenceNote()
│   │   ├─ confidence.combined → ordinal 1-5          ← reusa confidence_to_probability.mapping
│   │   ├─ Promedio entre fenómenos (igual peso)      ← Laplace
│   │   └─ Clasificación [1,3)→baja, [3,4)→media, [4,5]→alta
│   │
│   ├─ PASO 6: Narrativa Ejecutiva                    → buildExecutiveSummary()
│   │   ├─ Template del contrato literal              ← stage-07-presentation.md
│   │   ├─ Driver phenomenon = mismo que max-risk     ← coherencia semáforo/narrativa
│   │   ├─ evidence_summary con trace_id+phenomenon_id ← H-7.2, Rules Applied §2
│   │   └─ recommendation_intro reusa recommendations ← evita divergencia
│   │
│   └─ PASO 7: Ensamblaje de Output
│       ├─ Vista executive: base + trace_id
│       └─ Vista analyst: base + sources + signals + risk_calculation + transition_risks
│
├─ getSourcesUsed(input)                              ← H-7.10, filtro available
├─ getSourcesOutOfCoverage(input)                     ← H-7.8, complemento
├─ getSignalDetail(input, phenomena)                  ← H-7.8, source_quality + signal_strength
└─ mapSourceSummary(s)                                ← H-7.10, mapper compartido
```

## Dependencias de entrada

| Origen | Campo | Descripción |
|--------|-------|-------------|
| Stage 06 | `assessments[]` | Evaluaciones de riesgo con risk_score_raw, risk_level, probability, impact, adaptive_capacity |
| Stage 05 | `phenomena[]` | Fenómenos con confidence.combined, contributing_signals, status, horizon |
| Stage 04 | `signals[]` | Señales con source_quality.score, signal_strength.score |
| Stage 01 | `sources_consulted[]` | Fuentes con coverage_status, authority_level, spatial_distance_km |
| Config | `thresholds.json` | risk_classification (low_max/medium_max), confidence_to_probability.mapping, catastrophic_multiplier |
| Config | `phenomenon-definitions.json` | display_names por fenómeno (WMO/SENAMHI/INDECI) |
| Config | `adaptation-measures.json` | Catálogo de medidas de adaptación (Anexo 10.2) |
| User | `sector` | Sector económico del análisis |
| User | `view` | "executive" (default) o "analyst" |

## Output

El stage produce un objeto con esta estructura:

```javascript
{
  view: "executive" | "analyst",
  response: {
    // --- Campos comunes (executive + analyst) ---
    location: { name: string, coordinates: { lat, lon } },
    overall_risk: {
      level: "bajo" | "medio" | "alto" | "catastrofico",  // max-risk (worst-case)
      label: string,
      color: "verde" | "ámbar" | "rojo" | "morado",
      method: string,  // justificación del método de consolidación
      risk_composite: {
        score: number,   // promedio de risk_score_raw entre fenómenos
        level: string,   // bajo/medio/alto (NUNCA catastrofico)
        label: string,
      },
      risk_count: { bajo: N, medio: N, alto: N, catastrofico: N },
    },
    phenomena: [{
      name: string,           // display_name desde phenomenon-definitions.json
      status: string,         // "Activo" | "Proyectado" | "Histórico" | "No detectado"
      risk_contribution: {
        level: string,
        score: number | null, // null si no hay assessment para este fenómeno
        score_scale: { min: 0.2, max: number, formula: string },
      },
    }],
    recommendations: string[],  // priorizadas por risk_score_raw / signal_strength
    executive_summary: string,  // template del contrato con trazabilidad
    confidence_note: string,    // "Confianza alta/media/baja" o "no evaluable"
    trace_id: string,

    // --- Campo exclusivo de vista analyst ---
    sources_used?: SourceSummary[],
    sources_out_of_coverage?: SourceSummary[],
    signal_detail?: SignalSummary[],
    risk_calculation?: RiskCalculationSummary[],
    transition_risks?: TransitionRiskSummary[],
  }
}
```

## Resumen de los 7 pasos

| Paso | Nombre | Responsabilidad clave |
|------|--------|----------------------|
| 1 | Validación de Input | Parsear contra PresentationInputSchema, envolver errores en PresentationError |
| 2 | Consolidación de Riesgo Global | max-risk (level) + risk_composite (promedio) + risk_count (tally) |
| 3 | Formateo de Fenómenos | display_name, status, risk_contribution con score_scale |
| 4 | Generación de Recomendaciones | Medidas por fenómeno×sector (Anexo 10.2), priorizadas por score |
| 5 | Nota de Confianza | confidence.combined → ordinal → promedio → categoría |
| 6 | Narrativa Ejecutiva | Template del contrato con driver phenomenon + evidence_summary |
| 7 | Ensamblaje de Output | Executive (base) o Analyst (base + sources + signals + calculations) |

## Reglas Aplicadas

Las 4 reglas del contrato se verifican programáticamente:

1. **Todo valor numérico se traduce a categoría semántica** — overall_risk.level/risk_composite.level, risk_contribution.level, confidence_note siempre acompañan a su score.
2. **Toda afirmación en la narrativa tiene enlace a evidencia** — buildExecutiveSummary() incluye trace_id + phenomenon_id del driver.
3. **La respuesta es una proyección, no el artefacto completo** — getSourcesUsed/getSourcesOutOfCoverage/getSignalDetail proyectan campos específicos, no incluyen JSON crudo.
4. **Narrativas son templates, no IA** — buildExecutiveSummary() es determinista (mismo input → mismo output).

**GAP declarado**: "Si se solicita exportación (PDF), el artefacto completo puede incluirse como anexo técnico" — Stage 7 no tiene lógica de exportación PDF.

## Clasificaciones

| Elemento | Método | Referencia |
|----------|--------|------------|
| overall_risk.level | max-risk (worst-case) | COSO ERM 2017 §4.3, ISO 31000:2018 §6.6 |
| risk_composite.level | Promedio simple de risk_score_raw | Laplace/máxima entropía (H-6.16) |
| risk_composite classif. | reusa low_max/medium_max | ISO 31000 §6.6 (misma partición que Stage 6) |
| risk_count | Tally por risk_level | Conteo directo |
| confidence_note | confidence.combined → Likert → promedio | H-5.13, confidence_to_probability.mapping |
| catastrophe color | "morado" (no "rojo") | WCAG 1.4.1, riskLevelStyles.js |

## Configuración

| Archivo | Sección consumida | Uso |
|---------|-------------------|-----|
| `thresholds.json` | `risk_classification` (low_max, medium_max) | classifyCompositeRisk() |
| `thresholds.json` | `confidence_to_probability.mapping` | buildConfidenceNote() |
| `thresholds.json` | `overall_risk_consolidation` | Documentación del método seleccionado |
| `phenomenon-definitions.json` | `display_names` | formatPhenomenonName() |
| `adaptation-measures.json` | `measures_by_hazard_sector` | buildRecommendations() — medidas físicas |
| `adaptation-measures.json` | `transition_measures_by_type_sector` | buildRecommendations() — medidas transición |
| `adaptation-measures.json` | `generic_measures` | Fallback sector-agnóstico |
| `adaptation-measures.json` | `generic_transition_measures` | Fallback transición |

## Auditorías

Ver `AUDITORIA-stage-07-presentation.md` para hallazgos de calidad y su resolución (14 hallazgos, todos cerrados).
