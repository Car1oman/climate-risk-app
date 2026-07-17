# PASO-3 — Formateo de Fenómenos

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `formatPhenomenonName()`, `formatStatus()`, `getRiskContribution()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:286-344` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del formateo de nombres de fenómeno, estados, y contribuciones de riesgo con escala explícita |

---

## 1. Resumen Ejecutivo

Tres funciones transforman datos crudos de fenómenos y assessments en formas display-friendly: formatPhenomenonName() traduce IDs técnicos a nombres display con fuente institucional; formatStatus() traduce status técnicos a etiquetas en español; getRiskContribution() retorna score + score_scale para trazabilidad.

---

## 2. formatPhenomenonName() (H-7.6)

```javascript
formatPhenomenonName(name) {
  const displayNames = getPhenomenonDefinitions()?.display_names;
  const entry = displayNames?.[name];
  if (entry?.es) return entry.es;
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}
```

**Fuente**: phenomenon-definitions.json `display_names` — fuente única de verdad para metadatos de fenómeno (ya lo es para required_signals/scientific_reference). Cada entrada cita su fuente institucional:

| ID interno | Display name | Fuente |
|------------|-------------|--------|
| ola_de_calor | Ola de calor | WMO/SENAMHI |
| ola_de_frio | Ola de frío | WMO/SENAMHI |
| sequia | Sequía | WMO/SENAMHI |
| vientos_fuertes | Vientos fuertes | WMO/SENAMHI |
| inundacion | Inundación | IPCC/INDECI |
| el_nino | El Niño | NOAA/SENAMHI |
| la_nina | La Niña | NOAA/SENAMHI |
| deslizamiento | Deslizamiento | INGEMMET |
| huayco | Huaico | INDECI/SENAMHI |

**Caso notable**: "huayco" → "Huaico" (con 'i', no 'y'). "huaico" es la ortografía oficial en documentos de gestión de riesgo peruanos (INDECI, SENAMHI, Anexo 10.2).

**Fallback**: Para nombres fuera del enum, capitaliza cada palabra (consistente con el mapa). El fallback existe solo para robustez futura.

---

## 3. formatStatus()

```javascript
formatStatus(status) {
  const map = {
    active: "Activo",
    projected: "Proyectado",
    historical: "Histórico",
    not_detected: "No detectado",
  };
  return map[status] || status;
}
```

**Nota**: formatStatus() no tiene hallazgo asociado — es un mapeo directo sin ambigüedad. Se mantiene hardcodeado porque los 4 valores de StatusEnum son estables y no dependen de configuración externa.

---

## 4. getRiskContribution() (H-7.7)

```javascript
getRiskContribution(phenomenon, assessments) {
  const thresholds = getThresholds();
  const rc = thresholds?.risk_classification ?? {};
  const catastrophicMultiplier = rc.catastrophic_multiplier ?? 1.5;
  const scoreScale = {
    min: 0.2,
    max: Math.round(25 * catastrophicMultiplier * 100) / 100,
    formula: "(Probabilidad × Impacto) / Capacidad Adaptativa, ×catastrophic_multiplier si catastrophic_assessment.flagged — ISO 31000:2018 §6.6",
  };
  const assessment = (assessments || []).find(a => a.phenomenon_id === phenomenon.phenomenon_id);
  if (!assessment) return { level: "bajo", score: null, score_scale: scoreScale };
  return {
    level: assessment.risk_level,
    score: Math.round(assessment.risk_score_raw * 100) / 100,
    score_scale: scoreScale,
  };
}
```

**Decisiones clave**:

| Decisión | Justificación |
|----------|---------------|
| score_scale incluido | Nunca presentar un número crudo sin su fórmula/rango (mismo principio que H-7.1, H-7.4) |
| max = 25 × catastrophic_multiplier = 37.5 | Rango extendido cuando H-6.14 se aplica |
| score null en fallback | 0 estaba fuera del rango real (mínimo=0.2); null es honesto "sin assessment" |
| score redondeado a 2 decimales | P/I/CA son enteros Likert 1-5; más precisión no está sustentada |

---

## 5. Output por Fenómeno

```javascript
phenomena: [
  {
    name: "Ola de calor",           // formatPhenomenonName()
    status: "Activo",               // formatStatus()
    risk_contribution: {
      level: "alto",
      score: 8.33,                  // risk_score_raw redondeado a 2 decimales
      score_scale: {
        min: 0.2,
        max: 37.5,                  // 25 × catastrophic_multiplier
        formula: "(P × I) / CA, ×1.5 si catastrofico — ISO 31000:2018 §6.6",
      },
    },
  },
]
```

---

## 6. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.6 (BAJO): mapa hardcodeado 7 fenómenos | Movido a phenomenon-definitions.json display_names (9 entradas, cada una con fuente) |
| H-7.6 (BAJO): fallback sin capitalizar | Fallback ahora capitaliza cada palabra |
| H-7.7 (BAJO): score sin contexto de escala | score_scale {min, max, formula} agregado |
| H-7.7 (BAJO): fallback score=0 imposible | Corregido a score=null |
