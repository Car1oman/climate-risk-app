# Stage 06 — Risk Assessment

## Propósito

Evaluar el riesgo climático de cada fenómeno consolidado por Stage 5, calculando probabilidad (P), impacto (I) y capacidad adaptativa (CA), y produciendo un score de riesgo `(P × I) / CA` clasificado en categorías (bajo/medio/alto/catastrófico). Incluye evaluación de riesgos de transición por perfil sectorial y cobertura de evaluación multi-escenario/horizonte declarada explícitamente.

## Arquitectura del stage

```
index.js (Stage06Risk)
│
├─ async execute(input)
│   ├─ PASO 1: Carga de configuración y mapeos
│   │   ├─ getThresholds()                             ← thresholds.json
│   │   ├─ getAdaptiveCapacityConfig()                 ← adaptive-capacity.json
│   │   ├─ getSectorProfiles()                         ← sector-profiles.json
│   │   ├─ INDICATOR_TO_CANONICAL                      ← mapping ID→canonical variable
│   │   ├─ PHENOMENON_TO_EXTERNAL_PROBABILITY          ← mapping fenómeno→GRI variable
│   │   └─ DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING   ← tabla fallback [0.0→1, 0.2→2, ...]
│   │
│   ├─ PASO 2: Capacidad Adaptativa                    → calculateAdaptiveCapacity()
│   │   ├─ getIndicatorValue()                         ← normalización min-max desde canonical_variables
│   │   ├─ Promedio simple 1/N (Laplace)               ← pendiente AHP v3
│   │   └─ Fallback CA=null → default (3)              ← previene NaN en fórmula
│   │
│   ├─ PASO 3: Por cada fenómeno:
│   │   ├─ Probabilidad                               → calculateProbability()
│   │   │   ├─ Buscar fuente externa (GRI Oxford)     → getExternalProbability()
│   │   │   └─ Fallback: confidence.combined → tabla   ← H-5.13, H-6.7, H-6.9
│   │   │
│   │   ├─ Impacto                                    → calculateImpact()
│   │   │   ├─ Sensibilidad sectorial (0-1 → Likert)  ← H-6.4, sector-profiles.json
│   │   │   ├─ Exposición por bandas no solapadas      ← H-6.5, active/projected/not_detected
│   │   │   └─ impact = round(√(exp × sens))           ← H-6.3, media geométrica real
│   │   │
│   │   ├─ Clasificación catastrófica                  → classifyCatastrophic()
│   │   │   └─ impact ≥ 5 → risk_level="catastrofico"  ← H-6.14, consequence override
│   │   │
│   │   ├─ Score de riesgo                             ← (P × I) / CA, ISO 31000 §6.6
│   │   ├─ Clasificación de riesgo                     → classifyRisk() [bajo/medio/alto]
│   │   ├─ Clasificación temporal                      → classifyHorizon() [operativo/estrategico]
│   │   └─ Cobertura de evaluación                     → computeEvaluationCoverage()
│   │
│   └─ PASO 6: Ensamblar output
│       ├─ assessments[]                               ← 1 por fenómeno
│       ├- exposure[]                                  ← array separado (H-6.15)
│       ├─ adaptive_capacity                           ← con indicators[] formato contrato
│       ├─ transition_risks[]                          ← desde transition-risk-detector
│       └─ transition_risk_profile_source              ← "sector_specific" | "default"
│
├─ evaluateTransitionRisks(sector)
│   └─ detectTransitionRisks(sector)                   ← H-16, transition-risk-detector.js
│
├─ classifyCatastrophic(impact, thresholds)            ← H-6.14
├─ classifyRisk(score, thresholds)                     ← H-6.8
├─ classifyHorizon(phenomenon)                         ← H-6.6
└─ computeEvaluationCoverage(thresholds)               ← H-6.10
```

## Dependencias de entrada

| Origen | Campo | Descripción |
|--------|-------|-------------|
| Stage 05 | `phenomena[]` | Fenómenos con status, confidence.combined, horizon, scenario |
| Stage 03 | `canonical_variables[]` | Variables normalizadas (para CA y probabilidad externa) |
| Config | `thresholds.json` | Umbrales de riesgo, mapeos, bandas de exposición, cobertura requerida |
| Config | `adaptive-capacity.json` | Indicadores de CA con normalización min-max |
| Config | `sector-profiles.json` | Sensibilidad física/transition por sector |
| User | `sector` | Sector económico del análisis |
| User | `config` | Configuración adicional (reservado) |

## Output

El stage produce un objeto con esta estructura:

```javascript
{
  assessments: [
    {
      risk_id: UUID,
      phenomenon_id: UUID,
      sector: string,
      scenario: string,
      horizon: "corto" | "mediano" | "largo",
      evaluation_coverage: {
        mode: "single_scenario_single_horizon",
        scenarios_evaluated: 1,
        scenarios_required_by_contract: 2,
        horizons_evaluated: 1,
        horizons_required_by_contract: 3,
        meets_contract: false,
        justification: string,
      },
      probability: { value, source, external_source, justification },
      impact: {
        value: number,
        components: {
          exposure, sensitivity, physical_sensitivity, sensitivity_scaled,
          physical_sensitivity_source, adaptive_capacity
        },
        justification,
      },
      adaptive_capacity: { score, indicators_used, indicator_details, indicators[], justification },
      catastrophic_assessment: { flagged, criterion, threshold, justification },
      risk_score_raw: number,
      risk_level: "bajo" | "medio" | "alto" | "catastrofico",
      risk_classification: "operativo" | "estrategico",
    }
  ],
  exposure: [
    { phenomenon_id, level, factors, context_variables_used }
  ],
  adaptive_capacity: { score, indicators_used, indicator_details, indicators[], justification },
  transition_risks: [ { risk_id, sector, type, description, timeframe, severity, signal_strength } ],
  transition_risk_profile_source: "sector_specific" | "default",
}
```

## Resumen de los 6 pasos

| Paso | Nombre | Responsabilidad clave |
|------|--------|----------------------|
| 1 | Carga de configuración | Cargar thresholds, adaptive-capacity, sector-profiles; inicializar mapeos |
| 2 | Capacidad Adaptativa | Normalizar indicadores socioeconómicos, promediar, fallback CA=null→3 |
| 3 | Probabilidad | Fuente externa (GRI) o cálculo interno (confidence.combined → Likert 1-5) |
| 4 | Impacto | Sensibilidad sectorial × Exposición por bandas → media geométrica real |
| 5 | Clasificación | Risk score → bajo/medio/alto, catastrofico override, horizonte temporal |
| 6 | Ensamblaje | assessments[], exposure[], adaptive_capacity, transition_risks[] |

## Fórmula de riesgo

```
Risk Score = (P × I) / CA
```

- **P** (Probability): 1-5 Likert, desde fuente externa (GRI Oxford) o confidence.combined
- **I** (Impact): 1-5 Likert, media geométrica de exposición × sensibilidad
- **CA** (Adaptive Capacity): 1-5 Likert, promedio de indicadores socioeconómicos

**Fuente**: ISO 31000:2018 §6.6 (convención de ingeniería de riesgos, no prescripción IPCC).

## Clasificaciones

| Categoría | Umbral | Referencia |
|-----------|--------|------------|
| bajo | score ≤ 2 | ISO 31000 §6.6, simplificación de 5 niveles IPCC |
| medio | score ≤ 4 | ISO 31000 §6.6 |
| alto | score > 4 | ISO 31000 §6.6 |
| catastrofico | impact ≥ 5 (independiente del score) | ISO 31000/COSO ERM consequence override |
| operativo | horizon ≤ 10 años | TCFD (2017), contrato stage-06-risk.md §5 |
| estrategico | horizon > 10 años | TCFD (2017), contrato stage-06-risk.md §5 |

## Auditorías

Ver `AUDITORIA-stage-06-risk.md` para hallazgos de calidad y su resolución (18 hallazgos, todos cerrados).
