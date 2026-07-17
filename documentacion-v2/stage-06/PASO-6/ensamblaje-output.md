# PASO-6 — Ensamblaje de Output

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | Bloque de output en `execute()` (index.js:112-189) |
| **Ubicación** | `pipeline/stages/06-risk/index.js` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del ensamblaje del output final: assessments[], exposure[], adaptive_capacity, transition_risks[], transition_risk_profile_source |

---

## 1. Resumen Ejecutivo

PASO-6 ensambla el output completo de Stage 06: un array `assessments[]` con la evaluación de riesgo por fenómeno, un array `exposure[]` separado (según contrato), la capacidad adaptativa con indicadores en formato contrato, y los riesgos de transición por perfil sectorial. El loop itera sobre phenomena[] de Stage 5, calculando P, I, CA y clasificaciones por cada fenómeno.

---

## 2. Estructura del output

### 2.1 assessments[]

Cada entrada contiene:

```javascript
{
  risk_id: uuid(),
  phenomenon_id: phenomenon.phenomenon_id,
  sector,                           // H-6.18: agregado para trazabilidad
  scenario: phenomenon.scenario || "not_scenario_specific",
  horizon: phenomenon.horizon || "mediano",
  evaluation_coverage: {            // H-6.10: cobertura declarada
    mode, scenarios_evaluated, scenarios_required_by_contract,
    horizons_evaluated, horizons_required_by_contract,
    meets_contract, justification,
  },
  probability: { value, source, external_source, justification },
  impact: {
    value,
    components: {
      exposure,                     // Likert 1-5
      sensitivity,                  // Likert 1-5
      physical_sensitivity,         // raw 0-1 (H-6.18)
      sensitivity_scaled,           // Likert 1-5 (H-6.18)
      physical_sensitivity_source,  // "sector_specific" | "default" (H-6.13)
      adaptive_capacity,            // referencia, no afecta cálculo
    },
    justification,
  },
  adaptive_capacity: { score, indicators_used, indicator_details, indicators[], justification },
  catastrophic_assessment: { flagged, criterion, threshold, justification },
  risk_score_raw: number,
  risk_level: "bajo" | "medio" | "alto" | "catastrofico",
  risk_classification: "operativo" | "estrategico",
}
```

### 2.2 exposure[]

Array separado (H-6.15) construido desde `impact.exposure_detail` de cada assessment, sin recálculo:

```javascript
{
  phenomenon_id: UUID,
  level: number,                    // exposición Likert 1-5
  factors: {
    status: string,                 // "active" | "projected" | "not_detected"
    confidence_combined: number,    // [0, 1]
    band: [number, number],         // [floor, floor+band_width]
  },
  context_variables_used: [],       // honesto — no consume canonical_variables hoy
}
```

### 2.3 adaptive_capacity

```javascript
{
  score: number | null,             // Likert 1-5 o null
  indicators_used: string[],        // IDs de indicadores con datos
  indicator_details: [{ id, normalized_score }],
  indicators: [{                    // formato contrato (H-6.15)
    name: string,                   // = id del indicador
    value: number,                  // normalized_score
    weight: number | null,          // 1/N o null si CA=null
    contribution: number | null,    // normalized_score × weight o null
  }],
  justification: string,
}
```

### 2.4 transition_risks[]

Desde transition-risk-detector.js (H-16):

```javascript
{
  risk_id: string,                  // "${sector}_${type}"
  sector: string,
  type: "regulatory" | "market" | "technology" | "reputational" | "physical",
  description: string,
  timeframe: "corto" | "mediano" | "largo",
  severity: "baja" | "media" | "alta" | "catastrofica",
  signal_strength: number,          // severity_base × transition_sensitivity, [0,1]
}
```

### 2.5 transition_risk_profile_source

`"sector_specific"` si el sector tiene entrada propia en sector-profiles.json, `"default"` si cayó en el perfil default.

---

## 3. Contrato vs. implementación

| Campo del contrato | Estado | Notas |
|-------------------|--------|-------|
| `assessments: RiskAssessment[]` | Implementado | 1 por fenómeno |
| `exposure: Exposure[]` | Implementado (H-6.15) | Array separado, no anidado en impact |
| `adaptive_capacity.indicators` | Implementado (H-6.15) | {name, value, weight, contribution}[] |
| `stage, status` | Implementado | Por StageInterface.wrapArtifact() |
| `evaluation_coverage` | Implementado (H-6.10) | Declara brecha con contrato |
| `catastrophic_assessment` | Implementado (H-6.14) | Bypass + multiplicador |
| Multi-escenario (2 escenarios) | No implementado | Sin datos SSP en pipeline (HALLAZGO-8) |
| Multi-horizonte (3 horizontes) | No implementado | Stage 05 colapsa horizontes (H-5.9) |

---

## 4. Consumidores downstream

| Consumidor | Campo consumido | Uso |
|-----------|----------------|-----|
| Stage 07 (Presentation) | assessments[].risk_level, .risk_classification | Renderizado de resultados |
| Stage 07 (Presentation) | assessments[].probability, .impact | Tarjetas de riesgo por fenómeno |
| Evidence Artifact | Output completo | Registra en stages[5].output |
| Frontend | exposure[] | Visualización de exposición por fenómeno |
| Frontend | adaptive_capacity.indicators | Desglose de contribución de indicadores |

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-6.10 (ALTO): 1 evaluación vs 2×3 requeridas | computeEvaluationCoverage() declara brecha |
| H-6.11 (CRÍTICO): NaN en risk_score_raw | Fallback CA=3 + Number.isFinite guard |
| H-6.15 (MEDIO): output no cumplía contrato | exposure[] e indicators[] agregados |
| H-6.18 (BAJO): sector no propagado | sector en cada assessment |
| H-6.17 (BAJO): execute() sync | Corregido a async |
