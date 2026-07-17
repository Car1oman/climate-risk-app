# PASO-2 — Consolidación de Riesgo Global

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateOverallRisk()`, `classifyCompositeRisk()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:231-272` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la consolidación de N assessments en un riesgo global único, con comparación de 3 métodos y justificación de la elección |

---

## 1. Resumen Ejecutivo

calculateOverallRisk() consolida N assessments (uno por fenómeno) en un overall_risk único. Usa max-risk como método principal (level), complementado con risk_composite (promedio de scores) y risk_count (tally por nivel) para dar contexto de concentración que max-risk no captura por sí solo.

---

## 2. Método Seleccionado: Max-Risk (Worst-Case)

```javascript
calculateOverallRisk(assessments) {
  const riskCount = { bajo: 0, medio: 0, alto: 0, catastrofico: 0 };
  if (!assessments || assessments.length === 0) {
    return { level: "bajo", compositeScore: 0, compositeLevel: "bajo", riskCount, driverPhenomenonId: null };
  }
  const order = { bajo: 0, medio: 1, alto: 2, catastrofico: 3 };
  const max = assessments.reduce(
    (m, a) => (order[a.risk_level] > order[m.risk_level] ? a : m),
    assessments[0]
  );
  for (const a of assessments) {
    riskCount[a.risk_level] = (riskCount[a.risk_level] ?? 0) + 1;
  }
  const compositeScore =
    assessments.reduce((sum, a) => sum + (a.risk_score_raw ?? 0), 0) / assessments.length;
  return {
    level: max.risk_level,
    compositeScore,
    compositeLevel: this.classifyCompositeRisk(compositeScore),
    riskCount,
    driverPhenomenonId: max.phenomenon_id ?? null,
  };
}
```

**Propósito de cada campo retornado**:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `level` | string | Nivel del fenómeno con risk_level más alto (max-risk) |
| `compositeScore` | number | Promedio de risk_score_raw entre todos los assessments |
| `compositeLevel` | string | Clasificación del compositeScore (bajo/medio/alto, NUNCA catastrofico) |
| `riskCount` | object | Tally de assessments por cada risk_level |
| `driverPhenomenonId` | string \| null | phenomenon_id del assessment que determina level |

---

## 3. Clasificación del Composite (classifyCompositeRisk)

```javascript
classifyCompositeRisk(score) {
  const rc = getThresholds()?.risk_classification ?? { low_max: 2, medium_max: 4 };
  if (score <= rc.low_max) return "bajo";
  if (score <= rc.medium_max) return "medio";
  return "alto";
}
```

**Fundamento**: Reusa `low_max`/`medium_max` de thresholds.json risk_classification — la MISMA partición que Stage06Risk.classifyRisk() usa para un score individual (ISO 31000:2018 §6.6). No se inventa una segunda escala.

**Decisión clave**: classifyCompositeRisk() NUNCA retorna "catastrofico". Esa categoría es un consequence-override de UN fenómeno específico (H-6.14, impact.value ≥ 5), no una propiedad de un promedio de portafolio. Aplicarla al composite mezclaría dos semánticas distintas: severidad de un evento vs. concentración de un portafolio.

---

## 4. Comparación de Métodos (thresholds.json overall_risk_consolidation)

| Método | Expresión | Seleccionado | Justificación |
|--------|-----------|:------------:|---------------|
| **max-risk** | level = max(assessments[].risk_level) | Sí | Worst-case conservador (COSO ERM §4.3). Evita que riesgos bajos diluyan la señal de un riesgo severo aislado. |
| **weighted_average** | score = mean(assessments[].risk_score_raw), igual peso | Sí (como indicador secundario) | Da contexto de concentración. Promedio igual-ponderado (Laplace, H-6.16). |
| **sum_of_scores** | total = Σ risk_score_raw | No | Crece sin cota con N fenómenos — un sitio con 10 fenómenos "bajo" podría sumar más que 1 "catastrofico". |

**Portfolio correlation**: No implementado porque ningún stage produce datos de co-ocurrencia entre hazards. risk_count es la aproximación más simple y honesta disponible.

---

## 5. Output de overall_risk

```javascript
overall_risk: {
  level: "alto",                    // max-risk
  label: "Alto",                    // RISK_LABELS[level]
  color: "rojo",                    // RISK_COLORS[level]
  method: "max-risk (worst-case conservador — COSO ERM 2017 §4.3, ISO 31000:2018 §6.6)...",
  risk_composite: {
    score: 2.35,                    // promedio de risk_score_raw
    level: "medio",                 // classifyCompositeRisk(2.35)
    label: "Medio",
  },
  risk_count: { bajo: 3, medio: 1, alto: 1, catastrofico: 0 },
}
```

**Interpretación para un comité de riesgo**: "level=alto, risk_composite.level=medio, risk_count: {bajo:3, medio:1, alto:1}" → es 1 fenómeno aislado de alto riesgo, no una condición generalizada.

---

## 6. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.1 (MEDIO): calculateOverallRisk() sin documentación ni alternativas | 3 métodos comparados en thresholds.json, max-risk documentado con COSO ERM §4.3 |
| H-7.14 (MEDIO): no distinguía 1 fenómeno alto de 5 fenómenos altos | risk_composite + risk_count agregados al output |
| H-7.1 (MEDIO): risk_composite sin "catastrofico" | classifyCompositeRisk() nunca retorna catastrofico (semántica de portafolio, no de evento) |
