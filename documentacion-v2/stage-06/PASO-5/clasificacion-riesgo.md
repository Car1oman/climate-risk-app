# PASO-5 — Clasificación de Riesgo

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `classifyRisk()`, `classifyCatastrophic()`, `classifyHorizon()`, `computeEvaluationCoverage()` |
| **Ubicación** | `pipeline/stages/06-risk/index.js:573-717` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de las 4 clasificaciones: nivel de riesgo (bajo/medio/alto), catastrofico override, horizonte temporal (operativo/estrategico), y cobertura de evaluación multi-escenario/horizonte |

---

## 1. Resumen Ejecutivo

El PASO-5 aplica 4 clasificaciones al score de riesgo calculado: (1) classifyRisk() clasifica en bajo/medio/alto según umbrales ISO 31000; (2) classifyCatastrophic() detecta impacto máximo y aplica bypass + multiplicador; (3) classifyHorizon() clasifica en operativo/estrategico según horizon temporal; (4) computeEvaluationCoverage() declara la brecha entre cobertura real y contractual.

---

## 2. Clasificación de nivel de riesgo (H-6.8)

```javascript
classifyRisk(score, thresholds) {
  if (score <= thresholds.risk_classification.low_max) return "bajo";
  if (score <= thresholds.risk_classification.medium_max) return "medio";
  return "alto";
}
```

**Umbrales**:

| Categoría | Condición | Score equivalente | Interpretación |
|-----------|-----------|-------------------|----------------|
| bajo | score ≤ 2 | P=1,I=1,CA=5 → 0.2; P=3,I=2,CA=3 → 2.0 | Riesgo dentro de capacidad de absorción |
| medio | score ≤ 4 | P=3,I=3,CA=3 → 3.0; P=5,I=3,CA=4 → 3.75 | Manejable con intervención |
| alto | score > 4 | P=5,I=4,CA=2 → 10.0; P=5,I=5,CA=1 → 25.0 | Riesgo supera capacidad adaptativa |

**Fundamento**: ISO 31000:2018 §6.6 — la partition es una elección organizacional, no una prescripción IPCC. La nomenclatura (bajo/medio/alto) se alinea con la simplificación de los 5 niveles IPCC AR6 WGII Fig.SPM.1.

**Distribución verificada**: 34% bajo, 35% medio, 31% alto en P×I×CA space (test sensitivity analysis).

**Simplificación H-6.8**: `high_min=4` fue eliminado por redundante con `medium_max=4` (la condición score≥4 nunca se alcanzaba porque score≤4 ya la capturaba). Código muerto removido.

---

## 3. Clasificación catastrófica (H-6.14)

```javascript
classifyCatastrophic(impact, thresholds) {
  const threshold = thresholds.risk_classification.catastrophic_impact_threshold ?? 5;
  const flagged = impact.value >= threshold;
  return { flagged, criterion: "impact_at_scale_ceiling", threshold, justification };
}
```

**Lógica**: `impact.value ≥ 5` (techo de escala Likert) → risk_level = "catastrofico" con bypass total de classifyRisk() y multiplicador catastrophic_multiplier (1.5) sobre risk_score_raw.

**Fundamento**: Convención ISO 31000/COSO ERM de "consequence override" — cualquier ocurrencia en la fila de consecuencia máxima se escala a la categoría más alta sin importar la probabilidad.

**Verificación empírica**: Solo 1 de 30 combinaciones sector×exposición (3.3%) alcanza impact=5 — consistente con "≥P95 de la distribución de impactos".

**LIMITACIÓN DECLARADA**: Este proxy mide "consecuencia física máxima según este sistema", NO distingue las 4 sub-categorías del contrato (vida/legal/continuidad/reputación irreversible). El sistema no tiene datos para esa distinción.

---

## 4. Clasificación temporal (H-6.6)

```javascript
classifyHorizon(phenomenon) {
  return phenomenon.horizon === "largo" ? "estrategico" : "operativo";
}
```

**Regla**: 
- "corto" (≤5 años) → operativo
- "mediano" (5-10 años) → operativo
- "largo" (>10 años, ~30) → estrategico

**Fundamento**: Contrato stage-06-risk.md §5: "operativo si se materializa en ≤10 años, estratégico si >10 años". TCFD (2017) §B: horizonte corto <5, medio 5-10, largo >10.

**Corrección H-6.6**: La implementación anterior usaba phenomenon.status ("projected"→estrategico), ignorando phenomenon.horizon. Un fenómeno "active" con horizon="largo" se clasificaba erróneamente como operativo.

**No se introduce "táctico"**: RiskClassEnum y el contrato definen explícitamente una dicotomía. Agregar un tercer nivel requeriría cambiar el schema y a todos los consumidores downstream.

---

## 5. Cobertura de evaluación (H-6.10)

```javascript
computeEvaluationCoverage(thresholds) {
  const req = thresholds.evaluation_coverage_requirements;
  return {
    mode: "single_scenario_single_horizon",
    scenarios_evaluated: 1,
    scenarios_required_by_contract: req.scenarios_required,  // 2
    horizons_evaluated: 1,
    horizons_required_by_contract: req.horizons_required,    // 3
    meets_contract: false,
    justification: "...',
  };
}
```

**Brecha declarada**: Stage 6 produce 1 evaluación por fenómeno vs. las 2×3=6 requeridas por el contrato. La razón es estructural:
- **Escenarios**: No existe dimensión SSP en ningún dato del pipeline (Open-Meteo CMIP6 HighResMIP no la expone — HALLAZGO-8).
- **Horizontes**: Stage 05 colapsa corto/mediano/largo en un solo horizonte por prioridad (H-5.9).

**Decisión**: Declarar la brecha explícitamente (meets_contract=false) en vez de fabricar 6 evaluaciones idénticas con solo la etiqueta distinta.

---

## 6. Score de riesgo y apply del catastrofico

```javascript
const baseScoreRaw = (probability.value * impact.value) / caScore;
const catastrophicAssessment = this.classifyCatastrophic(impact, thresholds);
const riskScoreRaw = catastrophicAssessment.flagged
  ? baseScoreRaw * (thresholds.risk_classification.catastrophic_multiplier ?? 1.5)
  : baseScoreRaw;
const riskLevel = catastrophicAssessment.flagged ? "catastrofico" : this.classifyRisk(riskScoreRaw, thresholds);
```

**Flujo**: 
1. Calcular baseScoreRaw = (P × I) / CA
2. Verificar si impact ≥ catastrophic_impact_threshold
3. Si sí: riskLevel = "catastrofico", riskScoreRaw = baseScoreRaw × 1.5
4. Si no: riskLevel = classifyRisk(baseScoreRaw), riskScoreRaw = baseScoreRaw

---

## 7. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-6.6 (ALTO): classifyHorizon() ignoraba horizon | Corregido a phenomenon.horizon === "largo" |
| H-6.8 (BAJO): high_min=4 redundante | Eliminado, lógica simplificada |
| H-6.10 (ALTO): multi-escenario/horizonte no implementado | computeEvaluationCoverage() declara brecha explícitamente |
| H-6.14 (MEDIO): catastrophic_multiplier no activado | classifyCatastrophic() implementado con impact≥5 |
