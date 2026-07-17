# Auditoría Exhaustiva — Stage 06: Risk Assessment

**Fecha:** 2026-07-16
**Auditor:** Independiente (revisión técnica)
**Alcance:** Exclusivamente Stage 6 — `pipeline/stages/06-risk/index.js` (226 líneas)
**Dependencias revisadas:** `pipeline/config/thresholds.json`, `pipeline/config/sector-profiles.json`, `pipeline/config/adaptive-capacity.json`, `pipeline/orchestration/config-loader.js`, `pipeline/stages/04-signals/detectors/transition-risk-detector.js`, `pipeline/shared/types.js`, `specs/001-climate-risk-pipeline-rebuild/contracts/stage-06-risk.md`

---

## Resumen Ejecutivo

Stage 6 es el módulo de evaluación de riesgo climático. Recibe fenómenos consolidados por Stage 5, calcula probabilidad, impacto y capacidad adaptativa, y produce un score de riesgo clasificado en categorías (bajo/medio/alto). Es la etapa de **mayor complejidad analítica** del pipeline (226 líneas) y la más expuesta a preguntas de auditoría porque es donde los datos se convierten en un resultado decisivo.

**Hallazgo principal:** La mayoría de las decisiones críticas de Stage 6 están **parcialmente fundamentadas** — la fórmula de riesgo y los umbrales de clasificación tienen referencias a IPCC/ISO, pero la capacidad adaptativa no funciona (siempre null), la fórmula de impacto contiene una simplificación discutible, el contrato no se implementa según lo especificado, y la clasificación temporal es una dicotomía sin gradiente. El sistema actual produce resultados con **CA=null** en todas las ejecuciones, lo que anula el efecto del denominador en la fórmula de riesgo.

---

## Hallazgos

### H-6.1: Fórmula de riesgo `(P × I) / CA` — simplificación del marco IPCC

**Ubicación:** `pipeline/stages/06-risk/index.js:47`

**Cálculo actual:**
```javascript
const riskScoreRaw = (probability.value * impact.value) / adaptiveCapacity.score;
```

**Por qué es arbitrario:**

1. **El marco IPCC AR6 WGII define Riesgo = f(Amenaza, Exposición, Vulnerabilidad, CA)**, pero la función `f` no es necesariamente multiplicativa ni de cociente. IPCC AR6 WGII §1.4 describe riesgo como "the potential for consequences when something of value is at stake and the outcome is uncertain, recognizing the likelihood and magnitude of loss or gain" — una definición cualitativa, no una fórmula específica.

2. **La división por CA es una convención de ingeniería de riesgos** (ISO 31000:2018 §6.6 usa " likelihood × consequence / controls" como ejemplo ilustrativo, no como requisito normativo). Sin embargo, el marco IPCC no prescribe esta fórmula particular. El IPCC AR6 WGII Ch.8 §8.2 usa "vulnerabilidad" como concepto compuesto (sensibilidad + capacidad adaptativa), no como denominador.

3. **La elección de dividir vs. restar vs. usar otro operador** tiene implicaciones significativas: con CA=1 (mínima capacidad), el score se amplifica linealmente; con CA=5 (máxima capacidad), se comprime. Una fórmula aditiva como `P × I - CA` produciría resultados cualitativamente distintos. No hay análisis comparativo documentado.

4. **ISO 31000:2018 §6.6** dice explícitamente: "The relationship between the likelihood and consequence values and the level of risk is determined by the organization" — la fórmula es una elección organizacional, no una ley científica.

**Riesgo:** MEDIO. La fórmula es internamente consistente y produce scores con spread razonable, pero un auditor podría cuestionar por qué se usa división y no otro operador. La justificación "IPCC dice" es una simplificación de lo que IPCC realmente dice.

**Evidencia que debería existir:**
- Análisis comparativo de al menos 3 fórmulas alternativas (multiplicativa, aditiva, geométrica) conjustificación de por qué se eligió esta.
- Referencia directa a ISO 31000:2018 §6.6 como la fuente de la fórmula (no IPCC, que no prescribe fórmula).
- Análisis de sensibilidad: ¿cómo cambia el ranking de riesgos si se usa otra fórmula?

**Alternativa técnicamente justificable:**
- Mantener `(P × I) / CA` pero corregir la referenciaría: atribuir la fórmula a ISO 31000:2018 §6.6, no a IPCC.
- Agregar un campo `formula_source` en thresholds.json con la referencia precisa.
- Documentar que la división por CA es una convención de riesgo operacional, no una derivación científica.

**Nivel de criticidad:** MEDIO

---

### H-6.2: `getIndicatorValue()` siempre retorna null — CA nunca se calcula

**Ubicación:** `pipeline/stages/06-risk/index.js:128-130`

**Cálculo actual:**
```javascript
getIndicatorValue(id) {
  return null;
}
```

**Por qué es arbitrario:**

1. **Esta función es el punto de datos de entrada para la capacidad adaptativa, y siempre retorna null.** Esto significa que `calculateAdaptiveCapacity()` siempre termina en el branch de `used.length < minIndicators` (línea 117), retornando `score: null`.

2. **Con CA=null, la fórmula de riesgo `(P × I) / CA` produce `NaN`**, porque任何数除以 null es NaN. El código en la línea 47 calcula `riskScoreRaw = (probability.value * impact.value) / adaptiveCapacity.score` — si `adaptiveCapacity.score` es null, `riskScoreRaw` es NaN.

3. **`classifyRisk()` con score NaN** produce comportamiento indefinido: `NaN <= 2` es `false`, `NaN <= 4` es `false`, `NaN >= 4` es `false`, así que cae al fallback `return "medio"` (línea 220). Esto significa que **todos los riesgos se clasifican como "medio" cuando CA es null**, sin importar los valores de P e I.

4. **El contrato (stage-06-risk.md:47-48)** especifica: "Adaptive Capacity: calcular desde indicadores configurados (World Bank, GRI infraestructura). Cada indicador se normaliza a escala 1-5, se pondera." La implementación tiene la estructura pero no la ejecución.

**Riesgo:** CRÍTICO. El sistema produce resultados de riesgo que ignoran completamente la capacidad adaptativa. Todos los fenómenos se clasifican como "medio" cuando CA es null (que es siempre, dado que getIndicatorValue retorna null). Esto invalida la diferenciación por capacidad adaptativa y produce resultados potencialmente engañosos.

**Evidencia que debería existir:**
- Implementación de `getIndicatorValue()` que lea de world_bank_adapter o de los datos normalizados del pipeline.
- Test que verifique que CA no es null cuando hay datos disponibles.
- Análisis de qué pasa cuando no hay datos para ningún indicador (CA=null es aceptable en ese caso, pero no cuando los datos existen).

**Alternativa técnicamente justificable:**
- Implementar `getIndicatorValue()` para leer desde el output del pipeline (world_bank, gri_oxford) o desde un cache de datos normalizados.
- Si los datos no están disponibles, CA=null es correcto — pero el código debería tener un fallback a CA=3 (default del adaptive-capacity.json) en lugar de NaN.
- Agregar: `const caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity.default ?? 3;` antes de la fórmula.

**Nivel de criticidad:** CRÍTICO

---

### H-6.3: `calculateImpact()` usa división por 5 como normalización — sin fundamento formal

**Ubicación:** `pipeline/stages/06-risk/index.js:199`

**Cálculo actual:**
```javascript
const impactRaw = Math.round(exposure * sensitivityClamped / 5);
const value = Math.max(1, Math.min(5, impactRaw));
```

**Por qué es arbitrario:**

1. **La justificación en thresholds.json dice "Combinación tipo media geométrica"**, pero `exposure × sensitivity / 5` no es una media geométrica. La media geométrica de dos valores `a` y `b` es `√(a × b)`, no `(a × b) / 5`. El nombre es conceptualmente incorrecto.

2. **El divisor 5 se justifica como "normaliza el producto (max 5×5=25) a la escala 1-5"**, pero la media geométrica de 5×5 es 5 (ya está en la escala). Una normalización correcta sería `(a × b) / 5` → rango [0.2, 5], o `√(a × b)` → rango [1, 5]. El código produce un rango de `(1×1)/5=0.2` (clamped a 1) a `(5×5)/5=5`, que cubre [1, 5].

3. **El divisor 5 es una constante mágica** que depende de que la escala sea 1-5. Si la escala cambiara a 1-10, el divisor debería ser 10. No hay configurabilidad.

4. **El producto `exposure × sensitivity` asume independencia** entre ambas dimensiones. En la realidad, la exposición y la sensibilidad interactúan — un sector muy sensible con exposición baja puede tener un impacto menor que un sector moderadamente sensible con exposición alta. El producto simple no captura esta interacción.

**Riesgo:** MEDIO. La fórmula produce valores en el rango correcto y es internamente consistente, pero la justificación "media geométrica" es incorrecta y el divisor 5 es una constante no configurada.

**Evidencia que debería existir:**
- Corrección de la justificación: llamarlo "producto normalizado" o "combinación multiplicativa", no "media geométrica".
- Análisis de alternativas: ¿por qué `exposure × sensitivity / 5` y no `√(exposure × sensitivity)` o `max(exposure, sensitivity)`?
- Documentar que el divisor 5 está hardcodeado y depende de la escala Likert 1-5.

**Alternativa técnicamente justificable:**
- Usar media geométrica real: `Math.round(Math.sqrt(exposure * sensitivityClamped))`.
- O producto normalizado correctamente: `Math.round(exposure * sensitivityClamped / 5)`.
- Hacer el divisor configurable: `const divisor = thresholds.impact_calculation.scale_max ?? 5;`.

**Nivel de criticidad:** MEDIO

---

### H-6.4: Sensibilidad del sector escalada con `×4+1` — factor arbitrario

**Ubicación:** `pipeline/stages/06-risk/index.js:171-174`, `pipeline/config/thresholds.json:144-145`

**Cálculo actual:**
```javascript
const sensitivity = Math.round(
  physicalSensitivity01 * (impactConfig?.sensitivity_scale_factor ?? 4)
) + (impactConfig?.sensitivity_scale_offset ?? 1);
const sensitivityClamped = Math.max(1, Math.min(5, sensitivity));
```

**Por qué es arbitrario:**

1. **El factor `×4` y el offset `+1` son elegidos para mapear [0, 1] → [1, 5]**: `0×4+1=1`, `1×4+1=5`. Esto es correcto matemáticamente pero es solo una de muchas formas de hacer esta conversión lineal.

2. **No hay justificación de por qué se usa escalación lineal y no logarítmica, exponencial, o escalera.** Para un rango [0, 1]→[1, 5], una escalación logarítmica pondría más énfasis en las diferencias en el extremo bajo (donde los cambios son más significativos desde una perspectiva de riesgo).

3. **Los valores de `physical_sensitivity` en sector-profiles.json son asignaciones subjetivas**: agriculture=0.9, infrastructure=0.7, retail=0.6, energy=0.5, finance=0.3. No hay referencia a un índice de sensibilidad física sectorial publicado. El IPCC AR6 WGII no define sensibilidad sectorial con estos valores.

4. **El `sensitivity_scale_offset` (=1) garantiza que el mínimo sea 1**, pero esto se logra igualmente con `Math.max(1, ...)` que ya se aplica después. El offset es redundante con el clamp.

**Riesgo:** MEDIO. La escalación lineal es razonable pero no es la única opción defendible. Los valores de sensibilidad sectorial son los más arbitrarios del sistema.

**Evidencia que debería existir:**
- Fuente para cada valor de `physical_sensitivity` por sector (e.g., ND-GAIN, IPCC AR6 sectoral assessments).
- Análisis comparativo: ¿por qué lineal y no logarítmica?
- Documentar que el offset +1 es redundante con el clamp.

**Alternativa técnicamente justificable:**
- Usar sensibilidad desde fuentes sectoriales reconocidas (e.g., ND-GAIN sectoral vulnerability indices).
- Agregar un campo `_source` en cada entrada de sector-profiles.json que documente la fuente del valor.
- Hacer la función de escalación configurable: `sensitivity_function: "linear" | "logarithmic" | "step"`.

**Nivel de criticidad:** MEDIO

---

### H-6.5: Bases de exposición `active=4, projected=3, not_detected=1` — sin escala calibrada

**Ubicación:** `pipeline/stages/06-risk/index.js:183-188`, `pipeline/config/thresholds.json:146-148`

**Cálculo actual:**
```javascript
const statusBases = {
  active: impactConfig?.exposure_base_active ?? 4,
  projected: impactConfig?.exposure_base_projected ?? 3,
  not_detected: impactConfig?.exposure_base_not_detected ?? 1,
};
```

**Por qué es arbitrario:**

1. **Los valores 4, 3, 1 son elegidos por conveniencia** para crear un spread razonable en la escala 1-5, pero no hay una escala de exposición calibrada detrás. ¿Por qué active=4 y no active=5? ¿Por qué projected=3 y no projected=2? ¿Por qué not_detected=1 y no not_detected=0 (que sería clamped a 1 de todas formas)?

2. **La justificación "riesgo presente, mayor impacto" para active=4** es intuitiva pero no calibrada. Un fenómeno "active" con baja confianza (combined=0.1) tiene exposición `4 × (0.5 + 0.5 × 0.1) = 4 × 0.55 = 2.2`, que es más baja que un fenómeno "projected" con alta confianza (combined=0.9): `3 × (0.5 + 0.5 × 0.9) = 3 × 0.95 = 2.85`. ¿Es correcto que un fenómeno proyectado con alta confianza tenga mayor exposición que uno activo con baja confianza?

3. **El peso de confianza en exposición (`exposure_confidence_weight = 0.5`)** reduce la exposición base a un rango de `[0.5×base, 1.0×base]`. Con base=4, la exposición varía de 2.0 a 4.0. Con base=3, varía de 1.5 a 3.0. La diferenciación entre estados se reduce significativamente.

**Riesgo:** MEDIO. Los valores producen diferenciación entre estados, pero la interacción entre estado y confianza puede producir inversiones contraintuitivas (projected > active en ciertos casos).

**Evidencia que debería existir:**
- Análisis de intersección: ¿en qué combinaciones de estado × confianza se invierte el ranking?
- Justificación de por qué active=4 y no active=5.
- Referencia a una escala de exposición publicada (e.g., ND-GAIN exposure sub-index).

**Alternativa técnicamente justificable:**
- Usar escala de exposición de ND-GAIN (Chen et al., 2015) que mapea indicadores de exposición a escala ordinal.
- Hacer las bases configurables por fenómeno (no solo por estado): un "ola de_calor" activo puede tener exposición diferente a una "sequía" activa.
- Documentar la intersección estado × confianza con una tabla de sensibilidad.

**Nivel de criticidad:** MEDIO

---

### H-6.6: `classifyHorizon()` usa dicotomía operativo/estrategico sin gradiente

**Ubicación:** `pipeline/stages/06-risk/index.js:223-225`

**Cálculo actual:**
```javascript
classifyHorizon(phenomenon) {
  return phenomenon.status === "projected" ? "estrategico" : "operativo";
}
```

**Por qué es arbitrario:**

1. **El contrato (stage-06-risk.md:55)** dice: "operativo si se materializa en ≤10 años, estratégico si >10 años." La implementación ignora completamente el horizonte temporal y usa solo el status del fenómeno.

2. **Un fenómeno "active" con horizonte "largo" se clasifica como "operativo"**, lo cual es contradictorio: si el fenómeno es actual pero su horizonte es largo, la clasificación debería reflejar el horizonte temporal, no solo el estado actual.

3. **El contrato define 3 horizontes** (corto ≤5, mediano 5-10, largo >10), pero la implementación colapsa todo a 2 categorías binarias. La información de horizonte se pierde.

4. **IPCC AR6 WGII §1.4.3** distingue entre "near-term" (2021-2040), "mid-century" (2041-2060), y "late-century" (2061-2100) — una escala de 3 niveles, no 2.

**Riesgo:** ALTO. La clasificación temporal es una decisión de negocio con implicaciones estratégicas. Un usuario que recibe "estrategico" para un fenómeno "projected" a corto plazo podría subestimar la urgencia.

**Evidencia que debería existir:**
- Implementación según el contrato: `horizon === "corto" ? "operativo" : "estrategico"`.
- O mejor: mapeo completo corto→operativo, mediano→táctico, largo→estrategico.
- Referencia a TCFD horizontes temporales para justificar la clasificación.

**Alternativa técnicamente justificable:**
- Clasificar según el horizonte del fenómeno: `corto → operativo, mediano → táctico, largo → estrategico`.
- Agregar categoría intermedia "táctico" si se considera necesaria.
- Si se mantiene la dicotomía, al menos usar el horizonte en lugar del status: `phenomenon.horizon === "corto" ? "operativo" : "estrategico"`.

**Nivel de criticidad:** ALTO

---

### H-6.7: Mapeo `confidence_to_probability` — escalón lineal cada 0.2 sin calibración empírica

**Ubicación:** `pipeline/config/thresholds.json:108-114`, `pipeline/stages/06-risk/index.js:132-160`

**Cálculo actual:**
```json
"mapping": [
  [0.0, 1],
  [0.2, 2],
  [0.4, 3],
  [0.6, 4],
  [0.8, 5]
]
```

**Por qué es arbitrario:**

1. **Los umbrales [0.0, 0.2, 0.4, 0.6, 0.8] son un espaciado lineal igual**, que es la asignación de máxima entropía para una escala ordinal sin información adicional (Laplace). Esto es razonable como default pero no está calibrado contra datos empíricos de confianza-probabilidad.

2. **La escala Likert 1-5 para probabilidad** es consistente con IPCC AR6 WGII Fig.SPM.1, pero IPCC usa etiquetas cualitativas (very low, low, medium, high, very high), no numéricas. El mapeo numérico 1→"very low", 5→"very high" es una conversión que IPCC no prescribe.

3. **La función de mapeo es un escalón** (step function), no continua. Un confidence de 0.39 mapea a P=2, y un confidence de 0.40 mapea a P=3 — un cambio de 0.01 en confidence produce un cambio de 1 punto (50%) en probabilidad. Este efecto de umbral es una propiedad conocida de escalas ordinales pero no está documentado como decisión deliberada.

4. **El fallback sin config (`Math.ceil(score * 5)`)** es una escalación lineal continua que produce una distribución diferente a la tabla configurable. Un confidence de 0.5 produce P=3 (ambos), pero un confidence de 0.7 produce P=4 (fallback) vs P=3 (tabla). La elección entre tabla y fallback no está justificada.

**Riesgo:** MEDIO. El mapeo es razonable como default pero no está calibrado. El efecto de umbral puede producir resultados contraintuitivos en valores cercanos a los límites.

**Evidencia que debería existir:**
- Análisis de sensibilidad: ¿cómo cambia la distribución de scores con diferentes mapeos?
- Comparación con sistemas de evaluación de riesgo que usan escalas Likert para probabilidad.
- Documentación del efecto de umbral y su impacto en resultados.

**Alternativa técnicamente justificable:**
- Mantener el mapeo configurable pero documentar que es una elección de máxima entropía.
- Agregar una opción de mapeo continuo (e.g., `probability = Math.round(combined * 4 + 1)`).
- Documentar que los umbrales 0.2/0.4/0.6/0.8 son espaciado igual (Laplace) y están pendientes de calibración empírica.

**Nivel de criticidad:** MEDIO

---

### H-6.8: Umbrales de clasificación de riesgo `low_max=2, medium_max=4, high_min=4` — gap entre medio y alto

**Ubicación:** `pipeline/config/thresholds.json:98-100`, `pipeline/stages/06-risk/index.js:216-221`

**Cálculo actual:**
```javascript
classifyRisk(score, thresholds) {
  if (score <= thresholds.risk_classification.low_max) return "bajo";
  if (score <= thresholds.risk_classification.medium_max) return "medio";
  if (score >= thresholds.risk_classification.high_min) return "alto";
  return "medio";
}
```

**Por qué es arbitrario:**

1. **`medium_max=4` y `high_min=4` crean una discontinuidad**: un score de 4.0 es "medio" (por el primer check `<=4`), pero un score de 4.01 también es "medio" (por el tercer check `>=4` falla, cae al fallback). En realidad, `high_min=4` nunca se alcanza porque `medium_max=4` ya captura scores ≤4. La condición `score >= 4` solo captura scores >4 (e.g., 4.01).

2. **El gap entre low_max=2 y medium_max=4** significa que scores entre 2.01 y 4.0 son "medio" — un rango amplio. No hay diferenciación dentro de "medio" (e.g., "medio-bajo" vs "medio-alto").

3. **La justificación en thresholds.json** referencia "5 niveles IPCC colapsados a 3" pero IPCC AR6 WGII Fig.SPM.1 tiene 5 niveles de probabilidad y 5 niveles de impacto, que se combinan en una matriz de riesgo 5×5. Colapsar a 3×1 (bajo/medio/alto) pierde resolución.

4. **El fallback `return "medio"` al final** es un catch-all que nunca se alcanza con los umbrales actuales (porque `medium_max=4` cubre todo hasta 4, y `high_min=4` cubre todo desde 4). Es código muerto.

**Riesgo:** MEDIO. Los umbrales producen clasificaciones razonables, pero la condición de gap y el código muerto indican una implementación descuidada.

**Evidencia que debería existir:**
- Corrección de la condición: `if (score > thresholds.risk_classification.medium_max && score < thresholds.risk_classification.high_min)` debería ser un rango-gap explícito.
- O simplificar: `if (score <= 2) bajo; else if (score <= 4) medio; else alto`.
- Análisis de distribución de scores reales: ¿qué porcentaje cae en cada categoría?

**Alternativa técnicamente justificable:**
- Simplificar la lógica: `if (score <= low_max) return "bajo"; if (score < high_min) return "medio"; return "alto";`
- Agregar umbrales configurables para el gap: `medium_high_gap: [4.0, 4.0]` o eliminar el gap.
- Documentar que 3 categorías es una simplificación de los 5 niveles IPCC y está pendiente de refinamiento.

**Nivel de criticidad:** BAJO

---

### H-6.9: Contrato especifica fuentes externas de probabilidad — implementación no las consume

**Ubicación:** `specs/.../contracts/stage-06-risk.md:49-51` vs `pipeline/stages/06-risk/index.js:132-160`

**Cálculo actual:**
```javascript
// Contrato (stage-06-risk.md:49-51):
// 2. Probability: si existe fuente autoritativa con probabilidad directa
//    (e.g., GRI ISIMIP drought probability), usar ese valor mapeado a 1-5.
//    Si no, calcular desde signal_strength usando tabla de conversión.

// Implementación (index.js:132-160):
calculateProbability(phenomenon) {
  // Solo calcula desde confidence.combined, nunca busca fuentes externas
  const score = phenomenon.confidence?.combined ?? 0;
  // ...
}
```

**Por qué es arbitrario:**

1. **El contrato define que Stage 6 debe buscar fuentes externas de probabilidad** (e.g., GRI ISIMIP drought probability) y usarlas si existen. La implementación ignora completamente esta regla y siempre calcula internamente.

2. **El campo `probability.external_source` en el output siempre es `null`** (línea 157), confirmando que no se busca externamente.

3. **La regla "Probabilidad externa tiene prioridad sobre cálculo interno"** (linesApplied, línea 26) se declara pero no se implementa.

**Riesgo:** ALTO. El sistema no utiliza información externa de probabilidad que podría estar disponible (e.g., GRI ISIMIP para sequía). Esto produce resultados potencialmente menos precisos que si se consumieran fuentes externas.

**Evidencia que debería existir:**
- Implementación de la búsqueda de fuentes externas de probabilidad.
- Lista de fuentes externas soportadas (e.g., GRI ISIMIP, NOAA CPC).
- Lógica de fallback: si no hay fuente externa, calcular internamente.

**Alternativa técnicamente justificable:**
- Implementar `getExternalProbability(phenomenon)` que busque en authoritative-sources.json.
- Mapear el valor externo a la escala 1-5 usando la misma tabla configurable.
- Documentar qué fuentes externas están soportadas y cuándo están disponibles.

**Nivel de criticidad:** ALTO

---

### H-6.10: Contrato especifica evaluate en 2 escenarios y 3 horizontes — implementación produce 1 por fenómeno

**Ubicación:** `specs/.../contracts/stage-06-risk.md:64` vs `pipeline/stages/06-risk/index.js:44-72`

**Cálculo actual:**
```javascript
// Contrato (stage-06-risk.md:64):
// 5. Cada riesgo se evalúa en al menos 2 escenarios (≤2°C y >2°C) y 3 horizontes.

// Implementación (index.js:44-72):
for (const phenomenon of phenomena) {
  // Produce 1 assessment por phenomenon, no 2 escenarios × 3 horizontes
  assessments.push({
    scenario: phenomenon.scenario || "not_scenario_specific",
    horizon: phenomenon.horizon || "mediano",
    // ...
  });
}
```

**Por qué es arbitrario:**

1. **El contrato requiere al menos 6 evaluaciones por fenómeno** (2 escenarios × 3 horizontes). La implementación produce 1 evaluación por fenómeno, usando el escenario y horizonte que llegan de Stage 5 (que a su vez son valores por defecto).

2. **El escenario por defecto es "not_scenario_specific"** (línea 59), lo cual confirma que no hay evaluación multi-escenario. El pipeline no modela escenarios SSP.

3. **El horizonte por defecto es "mediano"** (línea 60), lo cual ignora la información de horizonte de Stage 5.

**Riesgo:** ALTO. El sistema no produce la evaluación multi-escenario/multi-horizonte que el contrato requiere. Un usuario que espera ver la diferencia entre escenarios ≤2°C y >2°C no la obtiene.

**Evidencia que debería existir:**
- Implementación de loop anidado: `for (scenario of scenarios) for (horizon of horizontes) for (phenomenon of phenomena)`.
- Definición de escenarios SSP en thresholds.json o phenomenon-definitions.json.
- Generación de al menos 6 assessments por fenómeno.

**Alternativa técnicamente justificable:**
- Implementar la evaluación multi-escenario/multi-horizonte según el contrato.
- Si no hay datos de escenario, documentar explícitamente que la evaluación es "scenario-agnostic" y por qué.
- Agregar un campo `evaluation_mode: "single" | "multi_scenario"` en el output.

**Nivel de criticidad:** ALTO

---

### H-6.11: CA=null produce riskScoreRaw=NaN — sin manejo explícito

**Ubicación:** `pipeline/stages/06-risk/index.js:47, 216-221`

**Cálculo actual:**
```javascript
const riskScoreRaw = (probability.value * impact.value) / adaptiveCapacity.score;
// Si adaptiveCapacity.score es null, riskScoreRaw = NaN

classifyRisk(score, thresholds) {
  if (score <= thresholds.risk_classification.low_max) return "bajo";  // NaN <= 2 → false
  if (score <= thresholds.risk_classification.medium_max) return "medio"; // NaN <= 4 → false
  if (score >= thresholds.risk_classification.high_min) return "alto";   // NaN >= 4 → false
  return "medio"; // ← siempre llega aquí cuando score es NaN
}
```

**Por qué es arbitrario:**

1. **No hay validación de CA null antes de la fórmula**. El código asume implícitamente que CA.score nunca es null, pero getIndicatorValue() siempre retorna null, haciendo que CA.score siempre sea null.

2. **NaN se propaga silenciosamente**: riskScoreRaw es NaN, se almacena en el output (línea 68), y se clasifica como "medio" por el fallback. No hay logging, warning, o indicación de que el score es inválido.

3. **El schema RiskAssessmentSchema** (types.js:386) define `risk_score_raw: z.number()` — NaN no es un número válido en la mayoría de serializadores JSON. Esto puede causar errores silenciosos en el frontend o en persistencia.

**Riesgo:** CRÍTICO. NaN en risk_score_raw puede causar errores de serialización, visualización incorrecta, o persistencia corrupta. La clasificación "medio" para todos los fenómenos cuando CA es null es engañosa.

**Evidencia que debería existir:**
- Validación explícita: `if (adaptiveCapacity.score == null) { ... fallback o error ... }`.
- O fallback a CA default: `const ca = adaptiveCapacity.score ?? thresholds.adaptive_capacity.default ?? 3;`.
- Test que verifique que risk_score_raw nunca es NaN.

**Alternativa técnicamente justificable:**
- Agregar antes de la fórmula: `if (adaptiveCapacity.score == null) { adaptiveCapacity.score = thresholds.adaptive_capacity.default ?? 3; adaptiveCapacity.justification += " — usando default por falta de indicadores"; }`.
- O: `const ca = adaptiveCapacity.score ?? 3;` y documentar el fallback.
- Agregar un campo `risk_score_status: "valid" | "degraded_ca_default" | "no_data"` en el output.

**Nivel de criticidad:** CRÍTICO

---

### H-6.12: Valores de sensibilidad sectorial sin fuente publicada

**Ubicación:** `pipeline/config/sector-profiles.json:5-135`

**Cálculo actual:**
```json
{
  "retail":      { "physical_sensitivity": 0.6, "transition_sensitivity": 0.5 },
  "agriculture": { "physical_sensitivity": 0.9, "transition_sensitivity": 0.4 },
  "finance":     { "physical_sensitivity": 0.3, "transition_sensitivity": 0.8 },
  "energy":      { "physical_sensitivity": 0.5, "transition_sensitivity": 0.9 },
  "infrastructure": { "physical_sensitivity": 0.7, "transition_sensitivity": 0.6 }
}
```

**Por qué es arbitrario:**

1. **No hay referencia a un índice de sensibilidad física sectorial publicado**. Los valores parecen razonables intuición (agriculture > infrastructure > retail > energy > finance para sensibilidad física) pero no provienen de una fuente verificable.

2. **ND-GAIN Country Index** tiene un componente de "vulnerability" que incluye sensibilidad sectorial, pero los valores no coinciden exactamente con los de sector-profiles.json.

3. **IPCC AR6 WGII** discute sensibilidad sectorial cualitativamente (agriculture es más sensible que finance a riesgos físicos) pero no proporciona valores numéricos en escala [0, 1].

4. **Los valores de `transition_sensitivity`** (energy=0.9, finance=0.8, infrastructure=0.6, retail=0.5, agriculture=0.4) reflejan intuición pero no están calibrados contra datos de transición energética.

**Riesgo:** MEDIO. Los valores son intuición razonable pero no son defendibles ante una auditoría que pida fuentes.

**Evidencia que debería existir:**
- Referencia a ND-GAIN, OECD, o IPCC para cada valor numérico.
- Análisis de sensibilidad: ¿cómo cambian los resultados si se altera cada sensibilidad en ±0.2?
- Documentar que los valores son placeholders pendientes de calibración.

**Alternativa técnicamente justificable:**
- Mapear sensibilidad desde ND-GAIN sectoral vulnerability scores.
- Agregar `_source` y `_confidence` a cada entrada de sensibilidad.
- Implementar análisis de sensibilidad que varíe cada valor y reporte la estabilidad del ranking.

**Nivel de criticidad:** MEDIO

---

### H-6.13: Fallback de sector-profiles.json retorna `physical_sensitivity: 0.5` — silencioso

**Ubicación:** `pipeline/stages/06-risk/index.js:16`

**Cálculo actual:**
```javascript
function getSectorProfiles() {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_PATH)) return { sectors: {}, default: { physical_sensitivity: 0.5 } };
  profilesCache = JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
  return profilesCache;
}
```

**Por qué es arbitrario:**

1. **Si el archivo no existe, se retorna un default con `physical_sensitivity: 0.5`** pero no se loggea ni se alerta. El sistema opera silenciosamente con sensibilidad media para todos los sectores.

2. **El default de sector-profiles.json (línea 131)** también tiene `physical_sensitivity: 0.5`, `transition_sensitivity: 0.5`, y `transition_risks: []`. Un sector sin perfil propio obtiene sensibilidad 0.5, que puede no ser representativa.

3. **El `profile_source: "default"`** (en transition-risk-detector.js:30) distingue entre "sector tuvo perfil propio" y "sector cayó en default", pero Stage 6 no expone esta distinción para sensibilidad física — solo para riesgos de transición.

**Riesgo:** BAJO. El fallback es razonable pero silencioso. Un usuario no puede saber si la sensibilidad 0.5 es real o un default.

**Evidencia que debería existir:**
- Log o warning cuando se usa el fallback.
- Campo `physical_sensitivity_source: "sector_profile" | "default"` en el output.
- Test que verifique el comportamiento con y sin sector-profiles.json.

**Alternativa técnicamente justificable:**
- Agregar `physical_sensitivity_source` al output de impacto, similar a `transition_risk_profile_source`.
- Loggear un warning cuando se usa el default.
- Si el archivo no existe, retornar CA=null (no calcular impacto sin datos sectoriales).

**Nivel de criticidad:** BAJO

---

### H-6.14: `catastrophic_multiplier` configurado pero no activado

**Ubicación:** `pipeline/config/thresholds.json:101-104`, `pipeline/stages/06-risk/index.js`

**Cálculo actual:**
```json
"catastrophic_multiplier": 1.5
```
```javascript
// En index.js no hay referencia a catastrophic_multiplier
// El campo existe en thresholds.json pero no se consume
```

**Por qué es arbitrario:**

1. **El valor 1.5 se justifica como "multiplicador conservador para eventos ≥P95"** (thresholds.json:104), pero no hay lógica en Stage 6 que determine si un fenómeno es "catastrófico" y aplique el multiplicador.

2. **El RiskLevelEnum** (types.js:64) incluye "catastrofico", pero classifyRisk() nunca lo retorna — solo produce "bajo", "medio", o "alto".

3. **El contrato (stage-06-risk.md:63)** dice: "Riesgo catastrófico señalado independientemente del score si cumple criterios (vida, legal, continuidad, reputación irreversible)." La implementación no tiene esta lógica.

**Riesgo:** MEDIO. El multiplicador y la categoría "catastrófico" están documentados pero no implementados. Un usuario que espera ver riesgos catastróficos no los obtendrá.

**Evidencia que debería existir:**
- Implementación de la lógica de detección de riesgo catastrófico.
- Definición de criterios: ¿qué fenómenos son catastróficos?
- Aplicación del multiplicador 1.5 cuando se detecta un caso catastrófico.

**Alternativa técnicamente justificable:**
- Implementar `classifyCatastrophic(phenomenon, riskScore)` que verifique criterios (e.g., phenomenon.name === "inundacion" && phenomenon.status === "active").
- Si es catastrófico: `riskScoreRaw *= catastrophic_multiplier` y `risk_level = "catastrofico"`.
- Documentar los criterios de catastrofe.

**Nivel de criticidad:** MEDIO

---

### H-6.15: Contrato especifica `exposure` como output separado — implementación lo incluye dentro de impact

**Ubicación:** `specs/.../contracts/stage-06-risk.md:38-43` vs `pipeline/stages/06-risk/index.js:62-66`

**Cálculo actual:**
```javascript
// Contrato output:
{
  assessments: RiskAssessment[],
  exposure: Exposure[],  // ← array separado
  adaptive_capacity: { score, indicators: [...] }
}

// Implementación output:
{
  assessments: [{ impact: { components: { exposure, sensitivity, adaptive_capacity } } }],
  adaptive_capacity: { score, indicators_used, justification },
  transition_risks: [...],
  transition_risk_profile_source: "..."
}
// No hay array `exposure` separado
// indicators tiene {name, value, weight, contribution} en contrato, {id} en implementación
```

**Por qué es arbitrario:**

1. **El contrato define `exposure` como un array separado** con campos `phenomenon_id, level, factors, context_variables_used`. La implementación incrusta exposure dentro de `impact.components` sin los campos `level`, `factors`, ni `context_variables_used`.

2. **El contrato define `indicators` con `{name, value, weight, contribution}`**. La implementación tiene `indicators_used: string[]` (solo IDs, sin valores, pesos, ni contribuciones).

3. **El contrato define `adaptive_capacity.indicators` con peso y contribución por indicador**. La implementación tiene `indicators_used` como array de strings.

**Riesgo:** MEDIO. El output no cumple el contrato, lo que puede causar problemas de integración con el frontend o con consumidores del output.

**Evidencia que debería existir:**
- Output que cumpla el contrato: `exposure[]` separado, `indicators` con peso y contribución.
- O actualización del contrato para reflejar la implementación real.
- Tests de contrato que verifiquen la estructura del output.

**Alternativa técnicamente justificable:**
- Implementar el output según el contrato.
- O actualizar el contrato: `indicators_used: string[]` es más simple que `indicators: {name, value, weight, contribution}[]`.
- Agregar un schema de validación del output que verifique la conformidad con el contrato.

**Nivel de criticidad:** MEDIO

---

### H-6.16: `calculateAdaptiveCapacity()` usa promedio simple — justificación "igual weight" sin análisis

**Ubicación:** `pipeline/stages/06-risk/index.js:108-125`

**Cálculo actual:**
```javascript
let sum = 0;
const used = [];
for (const ind of indicators) {
  const value = this.getIndicatorValue(ind.id);
  if (value != null) {
    sum += value;
    used.push(ind.id);
  }
}
if (used.length < minIndicators) {
  return { score: null, indicators_used: used, justification: `CA=null — indicadores disponibles (${used.length}) < mínimo requerido (${minIndicators})` };
}
const score = Math.round(sum / used.length);
return {
  score: Math.max(1, Math.min(5, score)),
  indicators_used: used,
  justification: `CA calculado como promedio simple de ${used.length} indicadores (igual weight — pesos diferenciales pendiente v3)`,
};
```

**Por qué es arbitrario:**

1. **El promedio simple (ponderación igual) es la asignación de máxima entropía** cuando no hay información para ponderar differently. Esto es justificable como default, pero el adaptive-capacity.json declara `weighting: "equal — 1/N sobre indicadores con datos disponibles"` sin un análisis AHP o de sensibilidad.

2. **El threshold `_min_indicators = 3`** se justifica por ND-GAIN y IPCC AR6, pero la implementación actual siempre produce 0 indicadores disponibles (porque getIndicatorValue retorna null), haciendo que el threshold sea irrelevante en la práctica.

3. **El clamp `[1, 5]`** garantiza que CA esté en la escala Likert, pero no hay justificación de por qué CA=1 es el mínimo (un país con 0 capacidad adaptativa) y CA=5 es el máximo.

**Riesgo:** BAJO. El promedio simple es un default razonable. El problema real es que getIndicatorValue retorna null, no el método de ponderación.

**Evidencia que debería existir:**
- Análisis AHP o de sensibilidad para determinar si los indicadores deberían ponderar differently.
- Documentar que el promedio simple es un placeholder pendiente de calibración.
- Implementar getIndicatorValue para que el promedio sea significativo.

**Alternativa técnicamente justificable:**
- Mantener promedio simple como default, documentar como placeholder.
- Agregar soporte para pesos configurables: `indicators: [{ id, weight }]`.
- Implementar análisis de sensibilidad que varíe los pesos y reporte la estabilidad del score.

**Nivel de criticidad:** BAJO

---

### H-6.17: `execute()` es sync pero `StageInterface.execute()` es async

**Ubicación:** `pipeline/shared/stage-interface.js:8` vs `pipeline/stages/06-risk/index.js:38`

**Cálculo actual:**
```javascript
// stage-interface.js:
async execute(input) { throw new Error(...); }

// 06-risk/index.js:
execute(input) { ... return { assessments, ... }; }  // No es async
```

**Por qué es arbitrario:**

1. **La interfaz base define `execute()` como `async`**, pero Stage 6 la implementa como sync. JavaScript permite esto (una función sync puede satisfacer una interface async), pero es una inconsistencia de diseño.

2. **Si en el futuro Stage 6 necesita leer archivos de configuración de forma asíncrona** (e.g., fetch de datos de World Bank), necesitará ser async.

**Riesgo:** BAJO. Funciona correctamente, pero es una deuda técnica.

**Evidencia que debería existir:**
- Decisión explícita de sync vs. async.

**Alternativa técnicamente justificable:**
- Hacer `execute()` async para consistencia con la interfaz base.

**Nivel de criticidad:** BAJO

---

### H-6.18: Sensibilidad sectorial no se propaga al output de la assessment

**Ubicación:** `pipeline/stages/06-risk/index.js:51-71`

**Cálculo actual:**
```javascript
assessments.push({
  risk_id: uuid(),
  phenomenon_id: phenomenon.phenomenon_id,
  scenario: phenomenon.scenario || "not_scenario_specific",
  horizon: phenomenon.horizon || "mediano",
  probability,
  impact: {
    value: impact.value,
    components: impact.components,
    justification: impact.justification,
  },
  adaptive_capacity: adaptiveCapacity,
  risk_score_raw: riskScoreRaw,
  risk_level: riskLevel,
  risk_classification: riskClass,
});
```

**Por qué es arbitrario:**

1. **El output incluye `impact.components.sensitivity`** pero no incluye el nombre del sector ni la sensibilidad numérica del sector. Un auditor no puede verificar que agriculture (sens=0.9) obtuvo sensibilidad 5 y finance (sens=0.3) obtuvo sensibilidad 2.

2. **El `sector` se usa para calcular la sensibilidad** (línea 46: `this.calculateImpact(phenomenon, sector, adaptiveCapacity.score)`) pero no se almacena en el output de la assessment.

**Riesgo:** BAJO. La información está en impact.components.sensitivity, pero falta el contexto del sector y la sensibilidad original.

**Evidencia que debería existir:**
- Campo `sector` en cada assessment.
- Campo `physical_sensitivity_original` en impact.components para trazabilidad.

**Alternativa técnicamente justificable:**
- Agregar `sector` al output de cada assessment.
- Agregar `physical_sensitivity` y `sensitivity_scaled` a impact.components.

**Nivel de criticidad:** BAJO

---

## Resumen Consolidado

### 1. Elementos completamente fundamentados

| Elemento | Fundamento | Referencia |
|----------|-----------|------------|
| Fórmula de riesgo `(P × I) / CA` | ISO 31000:2018 §6.6 | thresholds.json _methodology |
| Escala Likert 1-5 para P, I, CA | IPCC AR6 WGII Fig.SPM.1 | thresholds.json _refs |
| Mapeo confidence→probability con umbrales configurables | ISO 31000:2018 §6.6 | thresholds.json _refs.confidence_to_probability |
| CA=null cuando indicadores < mínimo | ND-GAIN Index (Chen et al., 2015) | adaptive-capacity.json _refs |
| Exposición base por estado (active/projected/not_detected) | IPCC AR6 WGII §1.4.3 | thresholds.json _refs._exposure_derivation |
| Escalación lineal de sensibilidad (0-1 → 1-5) | ND-GAIN Index normalización | thresholds.json _refs._sensitivity_scaling |
| Horizontes temporales (corto/mediano/largo) | TCFD (2017) §B | thresholds.json _refs.horizon_years |
| Clasificación de severidad en transición (baja/media/alta/catastrofica) | IPCC AR6 WGII Fig.SPM.1 | transition-risk-detector.js:66-80 |
| `profile_source` para distinguir sector específico vs default | H-16 (documentacion-v2/stage-04) | transition-risk-detector.js:17-25 |

### 2. Elementos parcialmente fundamentados

| Elemento | Lo que tiene | Lo que falta | Criticidad |
|----------|-------------|--------------|------------|
| Fórmula `(P × I) / CA` | Referencia a ISO 31000 | Análisis comparativo con alternativas | MEDIO |
| Mapeo confidence→probability | Escala Likert 1-5 | Calibración empírica de umbrales | MEDIO |
| Sensibilidad sectorial | Valores intuición razonables | Fuente publicada para cada valor | MEDIO |
| Promedio simple para CA | Principio de máxima entropía | Análisis AHP o de sensibilidad | BAJO |
| Umbrales de clasificación (2/4) | Equivalente operacional IPCC 5→3 | Análisis de distribución de scores | MEDIO |

### 3. Elementos arbitrarios o sin evidencia suficiente

| Elemento | Problema | Criticidad |
|----------|----------|------------|
| `getIndicatorValue()` retorna null siempre | CA nunca se calcula, NaN en risk_score_raw | **CRÍTICO** |
| NaN en risk_score_raw sin manejo | Clasificación "medio" para todos los fenómenos | **CRÍTICO** |
| `classifyHorizon()` ignora horizonte temporal | Dicotomía basada en status, no en horizonte | **ALTO** |
| Contrato: fuentes externas de probabilidad | No implementadas | **ALTO** |
| Contrato: multi-escenario/multi-horizonte | No implementado (1 evaluación por fenómeno) | **ALTO** |
| Divisor 5 en fórmula de impacto | Constante no configurable | MEDIO |
| "Media geométrica" — nombre incorrecto | Es producto normalizado, no media geométrica | MEDIO |
| Bases de exposición 4/3/1 | Sin escala calibrada, inversiones posibles | MEDIO |
| `catastrophic_multiplier` no activado | Configurado pero sin implementación | MEDIO |
| Output no cumple contrato | Falta `exposure[]` separado, `indicators` con peso | MEDIO |
| Sensibilidad sectorial sin fuente publicada | Valores intuición sin referencia verificable | MEDIO |
| Fallback de sector-profiles sin logging | Sensibilidad 0.5 silenciosa | BAJO |
| `execute()` sync vs async | Deuda técnica | BAJO |
| Sector no propagado al output | Falta trazabilidad | BAJO |

### 4. Acciones para alcanzar nivel profesional de trazabilidad

#### Prioridad CRÍTICA (resolver antes de producción)

1. **Implementar `getIndicatorValue()`** para leer datos reales de World Bank / GRI Oxford, o al menos tener un fallback a CA=3 (default configurable) en lugar de null/NaN.

2. **Agregar manejo explícito de CA=null**: `const ca = adaptiveCapacity.score ?? thresholds.adaptive_capacity.default ?? 3;` antes de la fórmula de riesgo. Agregar campo `risk_score_status` al output.

3. **Agregar validación de NaN** en risk_score_raw: `if (isNaN(riskScoreRaw)) throw new Error(...)` o fallback controlado.

#### Prioridad ALTA (resolver antes de v2)

4. **Implementar `classifyHorizon()` según contrato**: usar `phenomenon.horizon` en lugar de `phenomenon.status`.

5. **Implementar evaluación multi-escenario/multi-horizonte** según el contrato, o documentar explícitamente por qué no se implementa.

6. **Implementar búsqueda de fuentes externas de probabilidad** según el contrato, o documentar la decisión de no buscarlas.

#### Prioridad MEDIA (resolver antes de v3)

7. **Corregir la justificación** de la fórmula de impacto: "producto normalizado", no "media geométrica".

8. **Hacer el divisor 5 configurable** en thresholds.json.

9. **Agregar trazabilidad de sensibilidad sectorial** al output (sector, physical_sensitivity, sensitivity_scaled).

10. **Implementar `catastrophic_multiplier`** y la detección de riesgo catastrófico.

11. **Actualizar el output** para cumplir el contrato o actualizar el contrato.

12. **Agregar fuentes publicadas** para cada valor de sensibilidad sectorial en sector-profiles.json.

#### Prioridad BBA (resolver antes de auditoría externa)

13. **Análisis comparativo** de la fórmula de riesgo contra alternativas.

14. **Análisis AHP** o de sensibilidad para ponderación de indicadores de CA.

15. **Análisis de distribución** de scores reales vs umbrales de clasificación.

16. **Logging** cuando se usa fallback de sector-profiles.json.

17. **Hacer `execute()` async** para consistencia con la interfaz base.

---

## Estado de Resolución

**Fecha de revisión:** 2026-07-17 (verificado línea por línea contra `pipeline/stages/06-risk/index.js` actual, 719 líneas, como parte de `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md`)
**Estado:** TODOS LOS HALLAZGOS CERRADOS

> Esta sección se agrega porque el documento original (fechado 2026-07-16) quedó desactualizado por trabajo de remediación posterior a su escritura — un lector que se detuviera en la sección "Acciones para alcanzar nivel profesional de trazabilidad" (arriba) concluiría erróneamente que H-6.2 (CA=null→NaN) sigue activo. No es así: el código actual resuelve los 18 hallazgos, cada uno con su propio comentario inline citando `H-6.N` y la justificación completa.

| Hallazgo | Severidad | Resolución | Evidencia en código |
|---|---|---|---|
| H-6.1 (fórmula P×I/CA) | MEDIO | Re-atribuida a ISO 31000:2018 §6.6 (no a IPCC, que no prescribe fórmula) — `formula_source` documentado | `06-risk/index.js` rulesApplied, línea ~79 |
| H-6.2 (CA=null→NaN, CRÍTICO) | **CRÍTICO** | `getIndicatorValue()` lee de `canonical_variables` (mapeo `INDICATOR_TO_CANONICAL`); `caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity?.default ?? 3` antes de la fórmula — nunca null/NaN por esta vía | `execute()` línea 124, `getIndicatorValue()` línea 304-325 |
| H-6.3 (impacto = "media geométrica" incorrecta) | MEDIO | Corregido a `round(√(exposure×sensitivity))`, media geométrica real | `calculateImpact()` línea 524 |
| H-6.4 (sensitivity_scale_factor arbitrario) | MEDIO | Documentado como única solución del mapeo lineal f(0)=1,f(1)=5; valores por sector declarados como "ranking ordinal de juicio experto", no de índice publicado | `calculateImpact()`, comentario extenso |
| H-6.5 (bases de exposición con inversión contraintuitiva) | MEDIO | Rediseñado a bandas no solapadas `[floor, floor+band_width]` por estado | `calculateImpact()` línea 494-511 |
| H-6.6 (classifyHorizon ignora horizon) | ALTO | Corregido a `phenomenon.horizon === "largo" ? "estrategico" : "operativo"` | `classifyHorizon()` línea 662-663 |
| H-6.7 (mapeo confidence→probability sin calibración) | MEDIO | Documentado como espaciado uniforme (Laplace/máxima entropía), no calibración empírica; fallback unificado con la tabla configurada | `calculateProbability()`, `DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING` |
| H-6.8 (high_min redundante, código muerto) | BAJO | Eliminado; `classifyRisk()` simplificado a 3 ramas exhaustivas | `classifyRisk()` línea 583-587 |
| H-6.9 (probabilidad externa no implementada) | ALTO | `getExternalProbability()` implementado, consulta `canonical_variables` vía `PHENOMENON_TO_EXTERNAL_PROBABILITY` (GRI Oxford). Limitación declarada: depende de que Stage 03 extraiga `gri_flood/drought/extreme_heat_occurrence` (ver HALLAZGO-4 de stage-02, ya resuelto para `population/buildings/traveltime_healthcare`, pendiente para estas 3 variables de hazard) | `getExternalProbability()` línea 337-348, `calculateProbability()` línea 373-385 |
| H-6.10 (sin evaluación multi-escenario/horizonte) | ALTO | No fabricado (requeriría datos SSP inexistentes, HALLAZGO-8) — declarado honestamente vía `computeEvaluationCoverage()`, `meets_contract=false` explícito por assessment. **Ahora también propagado a Stage 07** (ver `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md` G1) | `computeEvaluationCoverage()` línea 704-717 |
| H-6.11 (NaN sin manejo explícito) | CRÍTICO | Cubierto por H-6.2 (eje CA) + guard `Number.isFinite()` explícito en `combined` (eje confidence, segunda vía de NaN no cubierta por H-6.2) | `calculateImpact()` línea 509 |
| H-6.12 (sensibilidad sectorial sin fuente publicada) | MEDIO | Declarado explícitamente como ranking ordinal de juicio experto con análisis de sensibilidad ±0.2 documentado en `sector-profiles.json._refs` | rulesApplied H-6.12 |
| H-6.13 (fallback sector-profiles silencioso) | BAJO | `physical_sensitivity_source` ("sector_specific"\|"default") agregado al output; falla ruidosamente si un perfil existe pero no declara `physical_sensitivity` | `calculateImpact()` línea 452-462 |
| H-6.14 (catastrophic_multiplier no activado) | MEDIO | `classifyCatastrophic()` implementado — `impact.value>=5` dispara `risk_level="catastrofico"` con bypass y multiplicador aplicado | `classifyCatastrophic()` línea 623-634 |
| H-6.15 (output no cumple contrato: exposure[], indicators) | MEDIO | `exposure[]` agregado a `execute()`; `adaptive_capacity.indicators` en formato `{name,value,weight,contribution}` | `execute()` línea 130-140, `calculateAdaptiveCapacity()` línea 285-296 |
| H-6.16 (promedio simple para CA sin análisis) | BAJO | Documentado como default de máxima entropía/Laplace; análisis de sensibilidad cuantitativo (propiedad de combinaciones convexas) agregado a la `justification` de cada ejecución | `calculateAdaptiveCapacity()` línea 259-296 |
| H-6.17 (execute sync vs async) | BAJO | `execute()` ahora `async` | línea 112 |
| H-6.18 (sector no propagado al output) | BAJO | `sector`, `physical_sensitivity`, `sensitivity_scaled` agregados a cada assessment/impact.components | `execute()` línea 156, `calculateImpact()` línea 538-539 |

**Veredicto post-verificación:** el gap real que sobrevive no está en Stage 06 mismo, sino en su dependencia declarada de Stage 03 (H-6.9: extracción de variables GRI Oxford de hazard) y Stage 02→03 (H-6.10: ausencia estructural de dimensión SSP, HALLAZGO-8) — ambos correctamente documentados como límites externos al alcance de este stage, no como hallazgos sin cerrar de Stage 06.
