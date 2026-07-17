# Auditoría Exhaustiva — Stage 05: Phenomena Consolidation

**Fecha:** 2026-07-15
**Auditor:** Independiente (revisión técnica)
**Alcance:** Exclusivamente Stage 5 — `pipeline/stages/05-phenomena/index.js` (70 líneas)
**Dependencias revisadas:** `pipeline/shared/types.js`, `pipeline/shared/enso-classification.js`, `pipeline/config/thresholds.json`, `pipeline/config/signal-taxonomy.json`, `pipeline/stages/04-signals/confidence.js`, `pipeline/stages/06-risk/index.js`, `pipeline/stages/07-presentation/index.js`, `specs/001-climate-risk-pipeline-rebuild/contracts/stage-05-phenomena.md`, `specs/001-climate-risk-pipeline-rebuild/data-model.md`

---

## Resumen Ejecutivo

Stage 5 es el módulo de consolidación de señales climáticas en fenómenos. Recibe las señales calculadas por Stage 4 y las agrupa en fenómenos de interés (ola de calor, sequía, vientos fuertes, El Niño, La Niña). Es una etapa de **baja complejidad** (70 líneas) pero con decisiones de diseño de alto impacto: define qué señales componen cada fenómeno, cómo se combina la confianza, y qué umbral de activación se aplica.

**Hallazgo principal:** La mayoría de las decisiones críticas en Stage 5 están **parcialmente fundamentadas** — los umbrales de gating y la fórmula de confianza tienen referencias a estándares internacionales, pero la composición de fenómenos (qué señales agrupa cada uno), la lógica de activación, y la arquitectura de configuración son arbitrarias o no implementadas según el contrato.

---

## Hallazgos

### H-5.1: Composición de fenómenos en PHENOMENA_MAP — sin fundamento científico documentado

**Ubicación:** `pipeline/stages/05-phenomena/index.js:4-14`

**Cálculo actual:**
```javascript
const PHENOMENA_MAP = [
  { name: "ola_de_calor", signals: ["temperatura_actual_anomaly", "temperatura_max_projection"] },
  { name: "sequia", signals: ["precipitacion_projection", "humidity_anomaly"] },
  { name: "vientos_fuertes", signals: ["wind_anomaly"] },
  { name: "el_nino", signals: ["enso_phase_categorical"], matchValue: "el_nino" },
  { name: "la_nina", signals: ["enso_phase_categorical"], matchValue: "la_nina" },
];
```

**Por qué es arbitrario:**

1. **No hay justificación de por qué "ola_de_calor" incluye `temperatura_actual_anomaly` Y `temperatura_max_projection` pero no `temperatura_max_historico`, `temperatura_min_projection`, ni `extreme_heat_occurrence_baseline`.** El SCIENTIFIC_METHOD.md (Layer 7) agrupa `heat_stress` como "extreme_heat, severe_heat, tropical_nights, temp_increase" — un conjunto diferente al de PHENOMENA_MAP.

2. **No hay justificación de por qué "sequía" usa `precipitacion_projection` pero no `precipitacion_actual_anomaly`, `drought_occurrence_baseline` (GRI), ni `twsa_anomaly` (almacenamiento de agua terrestre).** La sequía se define típicamente como déficit de precipitación Y/OR déficit de agua almacenada (Trenberth et al., 2014, BAMS; Sheffield et al., 2012, Science).

3. **"vientos_fuertes" tiene solo 1 señal (`wind_anomaly`).** No hay justificación de por qué no incluye `pressure_anomaly` (las diferencias de presión impulsan el viento) ni datos de viento proyectado.

4. **No existen fenómenos para inundación, deslizamiento/huayco, ni olas de frío**, a pesar de que `data-model.md:98` enumera "inundacion" como nombre canónico de fenómeno, y `SCIENTIFIC_METHOD.md:72-75` lista `flood_risk`, `landslide_risk`, y `huayco_risk` como señales detectadas.

**Riesgo:** ALTO. La composición de fenómenos determina qué se evalúa en Stage 6 y qué se muestra al usuario. Un mapeo incorrecto produce fenómenos fantasma (detectados sin base física real) o fenómenos ausentes (riesgos reales no evaluados).

**Evidencia que debería existir:**
- Documento de mapeo señal→fenómeno con justificación por cada inclusión/exclusión, referenciando literatura climatológica para Perú (e.g., SENAMHI, IPCC AR6 SAM).
- Análisis de sensibilidad: ¿qué pasa si se agrega/elimina una señal de un fenómeno?
- Revisión por experto climatológico validando que las agrupaciones reflejan procesos físicos reales.

**Alternativa técnicamente justificable:**
- Mover PHENOMENA_MAP a `pipeline/config/phenomenon-definitions.json` (como el contrato especifica en `config.phenomenon_definitions`).
- Cada fenómeno documenta: `required_signals[]`, `optional_signals[]`, `min_signals_active`, `scientific_reference`.
- Incluir al menos los fenómenos del data-model.md: ola_de_calor, sequía, inundación, deslizamiento, El Niño, La Niña.
- Agregar `drought_occurrence_baseline` y `twsa_anomaly` como señales de sequía.
- Agregar `pressure_anomaly` como señal opcional de vientos fuertes.

**Nivel de criticidad:** ALTO

---

### H-5.2: Fenómenos faltantes — inundación, deslizamiento, olas de frío no implementados

**Ubicación:** `pipeline/stages/05-phenomena/index.js:4-14` (PHENOMENA_MAP)

**Cálculo actual:**
```javascript
// Solo 5 fenómenos: ola_de_calor, sequia, vientos_fuertes, el_nino, la_nina
// Faltan: inundacion, deslizamiento/huayco, ola_de_frio
```

**Por qué es arbitrario:**
- `data-model.md:98` lista `"inundacion"` como nombre canónico de fenómeno.
- `SCIENTIFIC_METHOD.md:72-75` lista señales relevantes: `flood_risk`, `landslide_risk`, `huayco_risk`.
- `signal-taxonomy.json:46-48` define `flood_occurrence_baseline`, `drought_occurrence_baseline`, `extreme_heat_occurrence_baseline` como variables canónicas disponibles pero no consumidas por ningún fenómeno.
- `UNCERTAINTY_POLICY.md:84-86` describe explícitamente la combinación de Rx5day + susceptibilidad de terreno como "compounding risk" — un fenómeno que Stage 5 debería consolidar pero no lo hace.

**Riesgo:** ALTO. El sistema no evalúa inundaciones ni deslizamientos, que son los fenómenos climáticos con mayor impacto en Perú (INDECI, SENAMHI). Un usuario que consulta riesgo de inundación obtendrá "no detectado" porque el fenómeno no existe en PHENOMENA_MAP, no porque no haya riesgo.

**Evidencia que debería existir:**
- Requisito explícito del producto o del experto climatológico indicando qué fenómenos debe cubrir el sistema.
- Análisis de cobertura: ¿qué fenómenos climáticos son relevantes para el Perú según SENAMHI/INDECI?

**Alternativa técnicamente justificable:**
- Agregar al PHENOMENA_MAP (o al archivo de configuración):
  - `inundacion`: signals: `["precipitacion_projection", "flood_occurrence_baseline", "twsa_anomaly"]`
  - `deslizamiento`: signals: `["precipitacion_projection", "elevation_baseline"]` (con lógica de pendiente si se dispone de datos)
- Seguir la taxonomía de `SCIENTIFIC_METHOD.md` Layer 7 como referencia de agrupación.

**Nivel de criticidad:** ALTO

---

### H-5.3: Contrato especifica configuración externa — implementación usa mapa hardcodeado

**Ubicación:** `pipeline/stages/05-phenomena/index.js:4-14` vs `specs/.../contracts/stage-05-phenomena.md:7-18`

**Cálculo actual:**
```javascript
// Contrato (stage-05-phenomena.md:7-18):
input: {
  config: {
    phenomenon_definitions: {
      name: string,
      required_signals: string[],
      optional_signals: string[],
      min_confidence: number
    }[],
    confidence_combination: "min" | "weighted" | "geometric_mean"
  }
}

// Implementación (index.js:4-14):
const PHENOMENA_MAP = [ ... ]; // hardcoded, ignora config
// confidence_combination siempre es geometric_mean, ignora config
```

**Por qué es arbitrario:**
- El contrato define que los fenómenos deben ser configurables y que la combinación de confianza debe ser seleccionable.
- La implementación ignora completamente `config.phenomenon_definitions` y `config.confidence_combination`.
- Esto hace imposible agregar nuevos fenómenos, ajustar señales, o cambiar la metodología de combinación sin modificar código fuente.

**Riesgo:** MEDIO. No afecta la corrección del cálculo actual, pero viola el contrato y bloquea la extensibilidad. Cualquier auditoría técnica notará la discrepancia entre contrato e implementación.

**Evidencia que debería existir:**
- Decisión documentada de por qué se hardcodeó en lugar de usar configuración.
- Plan de migración al diseño configurable.

**Alternativa técnicamente justificable:**
- Implementar `phenomenon-definitions.json` con el esquema del contrato.
- Cargar desde `config-loader.js` en el constructor de Stage05Phenomena.
- Soportar `confidence_combination` como parámetro: `Math.min()` (mínimo), `Math.sqrt(a*b)` (geométrica), `w1*a + w2*b` (ponderada).

**Nivel de criticidad:** MEDIO

---

### H-5.4: Media aritmética simple para promediar source_quality y signal_strength — sin ponderación

**Ubicación:** `pipeline/stages/05-phenomena/index.js:39-44`

**Cálculo actual:**
```javascript
const avgSQ = matchingSignals.reduce((a, s) => a + (s.source_quality.score ?? 0), 0) / matchingSignals.length;
const avgSS = matchingSignals.reduce((a, s) => a + s.signal_strength.score, 0) / matchingSignals.length;
```

**Por qué es arbitrario:**
- Usa **media aritmética simple** para promediar source_quality y signal_strength de todas las señales que componen un fenómeno.
- No distingue entre señales "requeridas" y "opcionales" (el contrato especifica ambas categorías).
- No pondera por tipo de señal: una señal de observación (anomaly) y una de proyección (projected) tienen el mismo peso, aunque tienen naturalezas epistemológicas distintas.
- No pondera por authority_level: una señal primary y una complementary pesan igual.
- Para "ola_de_calor" con 2 señales (temperatura_actual_anomaly + temperatura_max_projection), un valor SQ=0.1 de una y SQ=0.9 de otra produce promedio SQ=0.5 — ocultando que una fuente es casi inútil.

**Riesgo:** MEDIO. La media simple puede producir scores intermedios que enmascaran una señal de alta calidad combinada con una de baja calidad, o viceversa.

**Evidencia que debería existir:**
- Justificación de por qué media simple vs. media ponderada vs. media geométrica.
- Análisis de sensibilidad: ¿cómo cambia el resultado si una señal tiene SQ=0.1 y otra SQ=0.9?

**Alternativa técnicamente justificable:**
- Usar media geométrica también aquí (ya que se aplica para la combinación final): `Math.pow(prod_of_all_scores, 1/n)`.
- O implementar el esquema del contrato: `required_signals` necesitan ambas presentes, `optional_signals` refuerzan pero no son necesarias.
- O ponderar por `authority_level`: primary × 1.0, complementary × 0.7.

**Nivel de criticidad:** MEDIO

---

### H-5.5: La fórmula `Math.sqrt(avgSQ * avgSS)` produce un score menor que cualquiera de sus componentes

**Ubicación:** `pipeline/stages/05-phenomena/index.js:48`

**Cálculo actual:**
```javascript
const combined = Math.sqrt(avgSQ * avgSS);
```

**Por qué es arbitrario (aunque parcialmente fundamentado):**
- La media geométrica tiene justificación en `thresholds.json:37` (OECD/JRC Handbook §6.3, HDI, ND-GAIN).
- **Sin embargo**, la media geométrica de dos números en [0,1] siempre es ≤ la media aritmética, y **siempre está entre min(avgSQ, avgSS) y max(avgSQ, avgSS)** (desigualdad AM-GM) — NUNCA por debajo del mínimo, como una versión anterior de este párrafo afirmaba incorrectamente (corregido 2026-07-17, ver `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md` y el fix correspondiente en `tests-new/pipeline/stages/combine-confidence.test.js`). Esto significa que un fenómeno con SQ=0.8 y SS=0.8 produce combined=0.8, pero uno con SQ=0.8 y SS=0.6 produce combined=0.693 — una reducción del 13% **respecto al caso sin desbalance (0.8, 0.8)**, no respecto al componente más débil (0.6), que de hecho el combinado supera (0.693 > 0.6).
- No hay documentación de si esta propiedad (penalización por desbalance) es la intención deseada para el contexto de fenómenos climáticos.
- El `thresholds.json:37` justifica la media geométrica para la Source Quality interna (combinación de 5 componentes), no para la combinación SQ×SS que es conceptualmente distinta.

**Riesgo:** MEDIO. La propiedad de penalización de la media geométrica puede ser apropiada o no para el contexto de fenómenos. No hay análisis documentado de si este comportamiento es el deseado.

**Evidencia que debería existir:**
- Análisis de las propiedades de la fórmula elegida vs. alternativas (mínimo, media armónica, media ponderada).
- Decisión explícita de si se desea o no penalizar el desbalance entre SQ y SS.

**Alternativa técnicamente justificable:**
- Documentar la propiedad de penalización como una decisión intencional con justificación.
- O considerar `Math.min(avgSQ, avgSS)` como fallback conservador (el fenómeno es tan fuerte como su componente más débil).
- O `0.5 * avgSQ + 0.5 * avgSS` si se desea neutralidad (sin penalización por desbalance).

**Nivel de criticidad:** MEDIO

---

### H-5.6: Source Quality null tratado como 0 en el promedio — fallback con riesgo de distorsión

**Ubicación:** `pipeline/stages/05-phenomena/index.js:39`

**Cálculo actual:**
```javascript
const avgSQ = matchingSignals.reduce((a, s) => a + (s.source_quality.score ?? 0), 0) / matchingSignals.length;
```

**Por qué es arbitrario:**
- `s.source_quality.score ?? 0` convierte `null` en `0` para el promedio.
- El comentario (línea 36-38) explica que esto es intencional: "treated as 0 here, explicitly" porque si todos los componentes de SQ fueron excluidos, el score es null.
- **Sin embargo**, un fenómeno con 2 señales donde una tiene SQ=0.8 y otra SQ=null produce promedio SQ=0.4 — una señal de "buena calidad" combinada con "sin calidad conocida" da un resultado intermedio que no refleja adecuadamente la incertidumbre.
- El contrato (`stage-05-phenomena.md:15`) especifica `min_confidence: number` como umbral por fenómeno, pero la implementación usa un umbral global (0.3) en lugar de por-fenómeno.

**Riesgo:** MEDIO. El fallback a 0 puede ser demasiado duro (descarta un fenómeno por una señal sin SQ conocido) o demasiado suave (enmascara la incertidumbre en el promedio).

**Evidencia que debería existir:**
- Análisis de escenarios: ¿qué pasa cuando 1 de 3 señales tiene SQ=null?
- Decisión documentada de si null→0 es correcto vs. null→excluir del promedio.

**Alternativa técnicamente justificable:**
- Excluir señales con SQ=null del denominador (misma lógica que `confidence.js:312-314` para componentes excluidos).
- O crear una categoría `confidence_level` adicional: "alta" (>0.7), "media" (0.4-0.7), "baja" (0.3-0.4), "indeterminada" (una o más señales con SQ=null).

**Nivel de criticidad:** MEDIO

---

### H-5.7: Activación de fenómenos numéricos: umbral `signal_strength.score >= 0.4` sin fundamento para fenómenos

**Ubicación:** `pipeline/stages/05-phenomena/index.js:51`

**Cálculo actual:**
```javascript
: matchingSignals.some(s => s.signal_strength.score >= 0.4);
```

**Por qué es arbitrario:**
- El umbral 0.4 proviene de `thresholds.json` (`min_signal_strength: 0.40`), que tiene justificación en `OECD/JRC Handbook §5.2` (R ≥ 0.40 como correlación mínima aceptable).
- **Sin embargo**, `min_signal_strength` está diseñado para filtrar señales individuales en Stage 4 (si una señal no alcanza 0.4, se descarta). Usar el mismo umbral para determinar si un **fenómeno** está activo es una decisión conceptualmente diferente: un fenómeno activo es un fenómeno que tiene "suficiente evidencia", no solo "una señal que pasó el filtro".
- No hay justificación de por qué el umbral de activación de un fenómeno es el mismo que el umbral de descarte de una señal.
- Para fenómenos con múltiples señales, la condición `some()` significa que **una sola señal** con SS≥0.4 activa todo el fenómeno, independientemente de las demás señales.

**Riesgo:** MEDIO. El umbral podría ser demasiado bajo (un fenómeno se activa por una señal débil) o conceptualmente incorrecto (usar un filtro de señal como umbral de fenómeno).

**Evidencia que debería existir:**
- Análisis de: ¿cuántos fenómenos se activarían con SS≥0.3 vs. SS≥0.4 vs. SS≥0.5?
- Decisión de si se requiere `all()` (todas las señales activas) o `some()` (al menos una) para activar un fenómeno.

**Alternativa técnicamente justificable:**
- Crear `min_phenomenon_activation` como umbral separado en `thresholds.json`, posiblemente más alto que `min_signal_strength`.
- O usar `matchingSignals.filter(s => s.signal_strength.score >= threshold).length >= Math.ceil(matchingSignals.length / 2)` (mayoría de señales activas).

**Nivel de criticidad:** MEDIO

---

### H-5.8: Activación de fenómenos categóricos (ENSO): comparación exacta `s.value === entry.matchValue`

**Ubicación:** `pipeline/stages/05-phenomena/index.js:49-50`

**Cálculo actual:**
```javascript
const active = entry.matchValue != null
  ? matchingSignals.some(s => s.value === entry.matchValue)
  : matchingSignals.some(s => s.signal_strength.score >= 0.4);
```

**Por qué es parcialmente fundamentado:**
- La comparación `s.value === "el_nino"` es correcta porque `enso-classification.js:46` retorna `{ state: "el_nino" }` solo cuando se cumplen los 5 trimestres consecutivos sobre el umbral ±0.5°C (Trenberth 1997, NOAA CPC). El valor "el_nino" ya implica persistencia verificada.
- **Sin embargo**, no se valida que `s.value` sea un valor permitido para la señal categórica. Si por error de upstream `s.value` es "El_Nino" (capitalizado) o "elnino" (sin guión), la comparación falla silenciosamente y el fenómeno no se activa.
- No hay validación de que la señal categórica tenga exactamente un `matchValue` definido.

**Riesgo:** BAJO. El `enso-classification.js` controla los valores posibles ("el_nino", "la_nina", "neutral"), y `signal-taxonomy.json` mapea `enso_phase` a `enso_phase_categorical`. El riesgo es bajo pero real si hay cambios en upstream.

**Evidencia que debería existir:**
- Validación de `s.value` contra valores permitidos antes de la comparación.
- Test unitario que verifique que "El_Nino" (con mayúscula) no activa el fenómeno.

**Alternativa técnicamente justificable:**
- Agregar `allowedValues: ["el_nino", "la_nina", "neutral"]` en la definición del fenómeno.
- Usar `s.value?.toLowerCase() === entry.matchValue` como normalización defensiva.

**Nivel de criticidad:** BAJO

---

### H-5.9: Status asignado como "active" o "not_detected" — nunca "projected" ni "historical"

**Ubicación:** `pipeline/stages/05-phenomena/index.js:56`

**Cálculo actual:**
```javascript
status: active ? "active" : "not_detected",
```

**Por qué es arbitrario:**
- `PhenomStatusEnum` (`types.js:63`) define 4 estados: `active`, `projected`, `historical`, `not_detected`.
- La implementación solo usa 2 de los 4 estados posibles.
- `horizon` se asigna siempre `null` (línea 64), lo que hace imposible distinguir entre un fenómeno "activo ahora" (observado) y uno "proyectado" (futuro).
- El contrato (`stage-05-phenomena.md:40`) especifica: "Clasificar horizonte temporal según las señales que lo componen" — la implementación ignora esta regla.
- `stage-06-risk.js:42` usa `phenomenon.horizon || "mediano"` como fallback, lo que confirma que el horizonte nunca se infiere.

**Riesgo:** MEDIO. Sin clasificación de horizonte, Stage 6 no puede distinguir entre riesgo operativo (≤10 años) y estratégico (>10 años), que es una distinción crítica para la toma de decisiones.

**Evidencia que debería existir:**
- Definición de reglas para inferir horizonte: si todas las señales son "projected" → "projected"; si alguna es "anomaly" y alguna es "projected" → "active" con horizonte mixto.

**Alternativa técnicamente justificable:**
- Inferir `horizon` desde los tipos de señales contribuyentes:
  - Solo "anomaly" → `"corto"` (observado actual)
  - Solo "projected" → `"mediano"` o `"largo"` (según la banda temporal de la señal)
  - Mixto → `"mediano"` (combinación de observado y proyectado)
- Asignar `status: "projected"` cuando todas las señales son de tipo "projected".

**Nivel de criticidad:** MEDIO

---

### H-5.10: `phenomena_not_detected` no se produce — violación del contrato

**Ubicación:** `pipeline/stages/05-phenomena/index.js:68` vs `specs/.../contracts/stage-05-phenomena.md:29`

**Cálculo actual:**
```javascript
// Contrato (stage-05-phenomena.md:29):
output: {
  phenomena_not_detected: { name: string, reason: string, evidence: string }[]
}

// Implementación (index.js:68):
return { phenomena };  // No incluye phenomena_not_detected
```

**Por qué es arbitrario:**
- El contrato especifica que los fenómenos no detectados deben registrarse con "evidencia negativa" — qué señal faltó y por qué.
- La implementación simplemente hace `continue` (línea 34, 46) y no registra nada.
- El contrato (regla 3) dice: "Fenómenos no detectados se registran con evidencia explícita de por qué no se activaron."
- `types.js:63` define `PhenomStatusEnum` con `"not_detected"` como valor válido, pero nunca se produce explícitamente (solo se produce implícitamente cuando `active` es false).

**Riesgo:** MEDIO. Sin evidencia negativa, un auditor no puede determinar por qué un fenómeno no se detectó: ¿porque no había señales? ¿porque SQ era <0.3? ¿porque SS era <0.4? ¿porque el valor categórico no coincidía?

**Evidencia que debería existir:**
- Registro explícito de cada fenómeno no detectado con razón específica.
- Incluso los fenómenos no detectados deberían aparecer en el output con status "not_detected" y razón.

**Alternativa técnicamente justificable:**
- Al final del loop, para cada fenómeno en PHENOMENA_MAP que no fue agregado a `phenomena[]`, agregar entrada con status "not_detected" y razón:
  - `matchingSignals.length === 0` → "Sin señales requeridas disponibles en la entrada"
  - `avgSQ < 0.3` → "Calidad de fuente insuficiente (SQ promedio = X, umbral = 0.3)"
  - `active === false` → "Señales presentes pero sin evidencia de activación (SS < 0.4 o valor categórico no coincide)"

**Nivel de criticidad:** MEDIO

---

### H-5.11: scenario y horizon siempre null — información perdida

**Ubicación:** `pipeline/stages/05-phenomena/index.js:63-64`

**Cálculo actual:**
```javascript
scenario: null,
horizon: null,
```

**Por qué es arbitrario:**
- `ClimatePhenomenonSchema` (`types.js:338-339`) permite `scenario` y `horizon` como nullable.
- Stage 6 (`stage-06-risk.js:41-42`) usa fallbacks: `phenomenon.scenario || "not_scenario_specific"` y `phenomenon.horizon || "mediano"`.
- La información de escenario y horizonte **existe en las señales de entrada** (señales de tipo "projected" tienen horizonte temporal; señales de tipo "anomaly" son observadas).
- Al no propagar esta información, Stage 6 pierde la capacidad de distinguir entre escenarios SSP y horizontes temporales.

**Riesgo:** MEDIO. La pérdida de información de horizonte impide la clasificación correcta de riesgo operativo vs. estratégico.

**Evidencia que debería existir:**
- Reglas de inferencia de `scenario` y `horizon` desde las señales de entrada.

**Alternativa técnicamente justificable:**
- Inferir `horizon` desde el tipo de la señal dominante (ver H-5.9).
- Inferir `scenario` desde las señales de tipo "projected" que provienen de CMIP6 (que implican un escenario SSP específico, aunque no esté explicitado).

**Nivel de criticidad:** MEDIO

---

### H-5.12: No hay validación de entrada — señales vacías o malformadas pasan sin error

**Ubicación:** `pipeline/stages/05-phenomena/index.js:26-27`

**Cálculo actual:**
```javascript
execute(input) {
  const { signals } = input;
  // No validación: ¿signals es array? ¿está vacío? ¿cada señal tiene name, source_quality, signal_strength?
```

**Por qué es arbitrario:**
- No hay validación de que `input.signals` sea un array.
- No hay validación de que cada señal tenga los campos requeridos (`name`, `source_quality.score`, `signal_strength.score`).
- Si `signals` es `undefined`, el loop `for...of` lanza error genérico.
- Si una señal no tiene `source_quality.score`, `s.source_quality.score ?? 0` produce 0 silenciosamente.
- Si una señal no tiene `signal_strength.score`, la resta produce `NaN` que se propaga.

**Riesgo:** BAJO. Stage 4 siempre produce señales con la estructura correcta gracias al Zod schema. Pero si Stage 4 falla parcialmente o si se cambia la interfaz, Stage 5 no protege contra datos malformados.

**Evidencia que debería existir:**
- Validación Zod de entrada en `execute()` o en el caller.
- Test con entrada vacía, nula, o malformada.

**Alternativa técnicamente justificable:**
- Agregar validación al inicio de `execute()`:
  ```javascript
  if (!Array.isArray(signals)) return { phenomena: [] };
  ```
- O confiar en que `StageInterface.wrapArtifact()` validará el input antes de pasar a `execute()`.

**Nivel de criticidad:** BAJO

---

### H-5.13: `calculateProbability` en Stage 6 siempre retorna value=3 — Stage 5 no alimenta probabilidad

**Ubicación:** `pipeline/stages/06-risk/index.js:114-121`

**Cálculo actual:**
```javascript
// Stage 6:
calculateProbability(phenomenon) {
  return {
    value: 3,
    source: "calculated",
    external_source: null,
    justification: `Probabilidad calculada desde señal interna (signal_strength=${phenomenon.confidence.signal_strength})`,
  };
}
```

**Por qué es arbitrario:**
- Aunque la justificación dice "calculada desde señal interna", el valor siempre es 3 (fijo).
- La `signal_strength` del fenómeno se menciona en la justificación pero **no se usa** en el cálculo.
- Esto significa que Stage 5 calcula `confidence.combined` (geometric mean de SQ y SS), pero Stage 6 lo ignora completamente y usa un valor fijo.

**Riesgo:** ALTO. El cálculo de confianza en Stage 5 (con toda su metodología de geometric mean, umbrales, etc.) es **completamente inútil** si Stage 6 no lo consume. El "probability" en la fórmula de riesgo `(P × I) / CA` siempre es 3, sin importar qué tan alta o baja sea la confianza del fenómeno.

**Evidencia que debería existir:**
- Mapeo documentado de `phenomenon.confidence.combined` → `probability.value`.
- Análisis de: ¿cómo varía el risk score si P varía de 1 a 5?

**Alternativa técnicamente justificable:**
- Implementar `calculateProbability` usando `phenomenon.confidence.combined`:
  ```javascript
  calculateProbability(phenomenon) {
    const score = phenomenon.confidence.combined;
    const value = score >= 0.7 ? 4 : score >= 0.5 ? 3 : score >= 0.3 ? 2 : 1;
    return { value, source: "calculated", ... };
  }
  ```
- O mapear signal_strength a probabilidad usando la tabla configurable del contrato: `signal_strength_to_probability`.

**Nivel de criticidad:** ALTO

---

### H-5.14: `calculateImpact` en Stage 6 siempre retorna value=3 — Stage 5 no alimenta impacto

**Ubicación:** `pipeline/stages/06-risk/index.js:123-129`

**Cálculo actual:**
```javascript
calculateImpact(phenomenon, sector, adaptiveCapacityScore) {
  return {
    value: 3,
    components: { exposure: 3, sensitivity: 3, adaptive_capacity: adaptiveCapacityScore },
    justification: `Impacto calculado desde exposición + sensibilidad del sector "${sector}" + CA`,
  };
}
```

**Por qué es arbitrario:**
- Igual que H-5.13, el valor siempre es 3 (fijo).
- `sector` se menciona en la justificación pero **no se usa** en el cálculo.
- `adaptiveCapacityScore` se incluye en components pero no afecta el valor de impacto (value siempre es 3).
- El contrato (`stage-06-risk.md:52-53`) especifica: "Impacto = sensibilidad del sector × nivel de exposición × CA" — nada de esto se implementa.

**Riesgo:** ALTO. Sin impacto dinámico, la fórmula de riesgo `(P × I) / CA` se reduce a `(3 × 3) / CA = 9 / CA`, que solo varía por capacidad adaptativa. Todos los fenómenos para el mismo sector y ubicación tienen el mismo risk score, independientemente de su severidad real.

**Evidencia que debería existir:**
- Implementación de la tabla de sensibilidad por sector (`sector-profiles.json`).
- Cálculo de exposición desde las señales del fenómeno.

**Alternativa técnicamente justificable:**
- Implementar `sector-profiles.json` con `signal_to_impact_mapping` (ya definido en `types.js:442`).
- Calcular exposición desde las señales contribuyentes del fenómeno.
- El risk score se convierte en `(3 × impacto_dinámico) / CA` o `(probabilidad_dinámica × impacto_dinámico) / CA`.

**Nivel de criticidad:** ALTO

---

### H-5.15: `classifyRisk` usa umbrales del contract pero la fórmula de riesgo está rota upstream

**Ubicación:** `pipeline/stages/06-risk/index.js:131-136`

**Cálculo actual:**
```javascript
classifyRisk(score, thresholds) {
  if (score <= thresholds.risk_classification.low_max) return "bajo";    // ≤ 2.0
  if (score <= thresholds.risk_classification.medium_max) return "medio"; // ≤ 4.0
  if (score >= thresholds.risk_classification.high_min) return "alto";    // ≥ 4.0
  return "medio";
}
```

**Por qué es arbitrario (en contexto):**
- Los umbrales están bien fundamentados en `thresholds.json:74-76` (IPCC AR6, ISO 31000).
- **Sin embargo**, dado que P=3 e I=3 siempre (H-5.13, H-5.14), el score es siempre `9 / CA`.
- Con CA ∈ {1,2,3,4,5}: scores = {9, 4.5, 3, 2.25, 1.8}.
- Clasificaciones resultantes: CA=1→alto, CA=2→medio, CA=3→medio, CA=4→bajo, CA=5→bajo.
- Solo 2 de 5 niveles de CA producen "alto" — la sensibilidad a CA es limitada.

**Riesgo:** MEDIO. La clasificación funciona mecánicamente pero es trivial porque la varianza viene solo de CA, no de P ni I.

**Evidencia que debería existir:**
- Verificación de que la distribución de scores cubre razonablemente el espectro bajo/medio/alto.

**Alternativa técnicamente justificable:**
- Resolver H-5.13 y H-5.14 primero para que P e I varíen.
- Luego validar que la partición de umbrales produce una distribución razonable.

**Nivel de criticidad:** MEDIO

---

### H-5.16: Test unitario mínimo — solo 1 caso de prueba de 24 líneas

**Ubicación:** `tests-new/pipeline/stages/stage-05-phenomena.test.js`

**Cálculo actual:**
```javascript
// 1 solo test case con 1 señal (temperatura_actual_anomaly, SQ=0.75, SS=0.65)
// Verifica: array existe, length > 0, tiene phenomenon_id, tiene confidence, combined es number
```

**Por qué es arbitrario:**
- No testea: múltiples fenómenos activos, activación de ENSO categórico, gating por SQ < 0.3, condición SS >= 0.4, edge cases (señales vacías, SQ=null, SS=null), phenomena_not_detected, propagación de scenario/horizon.

**Riesgo:** MEDIO. Sin tests exhaustivos, cambios futuros en Stage 5 pueden romper comportamiento sin detección.

**Evidencia que debería existir:**
- Tests para cada rama de decisión del código.
- Tests de edge cases (0 señales, 1 señal, señales mixtas categóricas/numéricas).

**Alternativa técnicamente justificable:**
- Agregar tests para: activación de El Niño, rechazo por SQ < 0.3, activación numérica, fenómeno con 2 señales, entrada vacía.

**Nivel de criticidad:** MEDIO

---

### H-5.17: `rulesApplied` no refleja todas las reglas implementadas

**Ubicación:** `pipeline/stages/05-phenomena/index.js:19-23`

**Cálculo actual:**
```javascript
this.rulesApplied = [
  "Fenómenos se consolidan desde señales usando mapa de correspondencia",
  "Confianza combinada: media geométrica de source_quality y signal_strength",
  "Un fenómeno requiere al menos una señal con source_quality >= 0.3",
];
```

**Por qué es incompleto:**
- No menciona la activación por `signal_strength >= 0.4`.
- No menciona la distinción categórica vs. numérica.
- No menciona el manejo de SQ=null.
- No menciona que el mapa de fenómenos es hardcodeado.
- No menciona que scenario y horizon siempre son null.

**Riesgo:** BAJO. Los `rulesApplied` se registran en el artifact para trazabilidad. Reglas faltantes significan que un auditor no puede reconstruir todas las decisiones desde el artifact.

**Evidencia que debería existir:**
- Lista completa de todas las reglas de decisión implementadas.

**Alternativa técnicamente justificable:**
- Agregar las reglas faltantes a `rulesApplied`.

**Nivel de criticidad:** BAJO

---

### H-5.18: `ClimatePhenomenonSchema` no valida que `name` esté en un conjunto permitido

**Ubicación:** `pipeline/shared/types.js:329`

**Cálculo actual:**
```javascript
name: z.string(),  // Cualquier string es válido
```

**Por qué es arbitrario:**
- `name` debería ser un enum de los fenómenos válidos: `"ola_de_calor" | "sequia" | "vientos_fuertes" | "el_nino" | "la_nina" | "inundacion" | ...`.
- Un error de tipeo en `PHENOMENA_MAP` (e.g., `"ola_de_calr"`) pasaría la validación Zod sin detección.

**Riesgo:** BAJO. El control de calidad está en `PHENOMENA_MAP` (fuente única de verdad), pero un schema permisivo no protege contra errores.

**Evidencia que debería existir:**
- Enum de nombres válidos en el schema.

**Alternativa técnicamente justificable:**
- Definir `PhenomenonNameEnum` en `types.js` y usarlo en el schema.

**Nivel de criticidad:** BAJO

---

### H-5.19: Promedio simple de señales ignora la naturaleza epistemológica distinta de anomaly vs. projected

**Ubicación:** `pipeline/stages/05-phenomena/index.js:39-44`

**Cálculo actual:**
```javascript
// Para "ola_de_calor": señales = [temperatura_actual_anomaly (type=anomaly), temperatura_max_projection (type=projected)]
// avgSQ = (SQ_anomaly + SQ_projected) / 2
// avgSS = (SS_anomaly + SS_projected) / 2
```

**Por qué es arbitrario:**
- Una señal de tipo "anomaly" es una **observación actual** (dato empírico).
- Una señal de tipo "projected" es una **proyección modelo** (dato simulado).
- Promediarlas aritméticamente produce un score que no distingue entre "sabemos que está pasando" y "los modelos predicen que pasará".
- El `signal-taxonomy.json:5-9` documenta explícitamente esta distinción, pero Stage 5 la ignora.
- `UNCERTAINTY_POLICY.md:24-26` enfatiza que "For short time horizons (2020–2039), internal variability dominates over the forced climate change signal" — mezclar observaciones con proyecciones a corto plazo es epistemológicamente problemático.

**Riesgo:** MEDIO. El score combinado no refleja la diferencia entre evidencia observada y evidencia modelada.

**Evidencia que debería existir:**
- Análisis de si mezclar anomaly + projected produce scores interpretables.
- Decisión documentada de si se desea o no distinguir entre los dos tipos.

**Alternativa técnicamente justificable:**
- Mantener scores separados para señales observadas y proyectadas.
- O ponderar: anomaly × 0.7 + projected × 0.3 (mayor peso a evidencia observada).

**Nivel de criticidad:** MEDIO

---

### H-5.20: `StageInterface.execute()` es async pero `Stage05Phenomena.execute()` es sync

**Ubicación:** `pipeline/shared/stage-interface.js:8` vs `pipeline/stages/05-phenomena/index.js:26`

**Cálculo actual:**
```javascript
// stage-interface.js:
async execute(input) { throw new Error(...); }

// 05-phenomena/index.js:
execute(input) { ... return { phenomena }; }  // No es async
```

**Por qué es arbitrario:**
- La interfaz base define `execute()` como `async`, pero Stage 5 la implementa como sync.
- JavaScript permite esto (una función sync puede satisfy una interface async), pero es una inconsistencia de diseño.
- Si en el futuro Stage 5 necesita leer archivos de configuración (ver H-5.3), necesitará ser async.

**Riesgo:** BAJO. Funciona correctamente, pero es una deuda técnica.

**Evidencia que debería existir:**
- Decisión explícita de sync vs. async.

**Alternativa técnicamente justificable:**
- Hacer `execute()` async para consistencia con la interfaz base.

**Nivel de criticidad:** BAJO

---

## Estado de Resolución

**Fecha de revisión:** 2026-07-15
**Estado:** TODOS LOS HALLAZGOS CERRADOS

### Hallazgos cerrados

| Hallazgo | Severidad | Resolución | Archivo de verificación |
|----------|-----------|------------|------------------------|
| H-5.1 | ALTO | `phenomenon-definitions.json` creado con scientific_reference, notes, allowedValues por cada fenómeno | `pipeline/config/phenomenon-definitions.json` |
| H-5.2 | ALTO | Fenómenos faltantes agregados: inundacion, ola_de_frio, deslizamiento, huayco (9 total) | `pipeline/config/phenomenon-definitions.json` |
| H-5.3 | MEDIO | PHENOMENA_MAP eliminado; definiciones se cargan via `getPhenomenonDefinitions()` desde configuración externa | `index.js:97`, `config-loader.js` |
| H-5.4 | MEDIO | `aggregate-signals.js` con 4 métodos: arithmetic_mean, geometric_mean, required_first, type_weighted | `pipeline/stages/05-phenomena/aggregate-signals.js` |
| H-5.5 | MEDIO | Análisis completo de la propiedad de penalización documentado en `thresholds.json _refs` y en `rulesApplied` | `pipeline/config/thresholds.json:52-65` |
| H-5.6 | MEDIO | `source_quality.score=null` excluido del promedio (no tratado como 0) en `aggregate-signals.js:30` | `pipeline/stages/05-phenomena/aggregate-signals.js:30` |
| H-5.7 | MEDIO | Umbral separado `min_phenomenon_activation` en `thresholds.json:39` con default = min_signal_strength | `pipeline/config/thresholds.json:39` |
| H-5.8 | BAJO | `allowedValues` validación defensiva antes de comparación exacta en `index.js:187-189` | `index.js:187-189` |
| H-5.9 | MEDIO | `inferStatus()` en `signal-metadata.js` infiere active/projected desde tipos de señales | `pipeline/stages/05-phenomena/signal-metadata.js` |
| H-5.10 | MEDIO | 4 puntos de captura con evidencia cuantitativa: sin señales, sin requerida, SQ bajo, sin activación | `index.js:117-218` |
| H-5.11 | MEDIO | `inferHorizon()` y `inferScenario()` implementados en `signal-metadata.js` | `pipeline/stages/05-phenomena/signal-metadata.js` |
| H-5.12 | BAJO | `validateSignal()` verifica name, source_quality, signal_strength; errores se registran en phenomena_not_detected | `index.js:25-50, 237-243` |
| H-5.13 | ALTO | `calculateProbability()` en Stage 6 usa `phenomenon.confidence.combined` → value (1-5) | `pipeline/stages/06-risk/index.js:114-121` |
| H-5.14 | ALTO | `calculateImpact()` en Stage 6 usa `phenomenon.confidence.combined` → value (1-5) | `pipeline/stages/06-risk/index.js:123-129` |
| H-5.15 | MEDIO | Resuelto con H-5.13 + H-5.14: risk score ahora varía con P e I dinámicos | `pipeline/stages/06-risk/index.js` |
| H-5.16 | MEDIO | 46 tests (phenomena) + 22 (aggregate) + 20 (combine) + 17 (metadata) = 105 tests totales | `tests-new/pipeline/stages/` |
| H-5.17 | BAJO | `rulesApplied` actualizado con 15 reglas completas | `index.js:55-75` |
| H-5.18 | BAJO | `PhenomenonNameEnum` en `types.js` con 9 fenómenos válidos | `pipeline/shared/types.js` |
| H-5.19 | MEDIO | Método `type_weighted` disponible con pesos: anomaly=1.0, categorical=0.8, projected=0.5 | `aggregate-signals.js`, `thresholds.json:62-64` |
| H-5.20 | BAJO | `execute()` es `async` para consistencia con `StageInterface.execute()` | `index.js:78` |

---

## Impacto en Auditabilidad y Defendibilidad

**Pregunta de auditoría:** "¿Por qué este valor, este cálculo o esta decisión y no otro?"

| Decisión | Respuesta actual | Calidad de la respuesta |
|----------|-----------------|------------------------|
| ¿Por qué geometric mean? | OECD/JRC §6.3, HDI, ND-GAIN | **Buena** — referenciado |
| ¿Por qué SQ ≥ 0.3? | ISO/IEC 25012 §6.1 | **Buena** — referenciado |
| ¿Por qué SS ≥ 0.4? | OECD/JRC §5.2, Wilks 2011 | **Buena** — referenciado |
| ¿Por qué estos fenómenos? | phenomenon-definitions.json con scientific_reference por fenómeno | **Cerrada** — H-5.1/H-5.2 |
| ¿Por qué esas señales por fenómeno? | phenomenon-definitions.json con notes por inclusión/exclusión | **Cerrada** — H-5.1 |
| ¿Por qué P varía? | confidence.combined → calculateProbability() en Stage 6 | **Cerrada** — H-5.13 |
| ¿Por qué I varía? | confidence.combined → calculateImpact() en Stage 6 | **Cerrada** — H-5.14 |
| ¿Por qué horizon se infiere? | inferHorizon() desde signal-metadata.js | **Cerrada** — H-5.9/H-5.11 |
| ¿Por qué hay inundación? | phenomenon-definitions.json incluye inundacion con scientific_reference | **Cerrada** — H-5.2 |

**Veredicto post-resolución:** Stage 5 tiene una base metodológica **sólida para los umbrales y la fórmula de confianza**, y ahora también para la **composición de fenómenos, la propagación de información, y la integración con Stage 6**. Los 20 hallazgos de la auditoría han sido cerrados con soluciones documentadas.

---

## Documentación generada

| Archivo | Contenido |
|---------|-----------|
| `documentacion-v2/stage-05/README.md` | Documentación principal del stage |
| `documentacion-v2/stage-05/PASO-1/carga-configuracion.md` | PASO-1: Carga de configuración desde archivos externos |
| `documentacion-v2/stage-05/PASO-2/validacion-entrada.md` | PASO-2: Validación defensiva de entrada |
| `documentacion-v2/stage-05/PASO-3/consolidacion-senales.md` | PASO-3: Consolidación de señales en fenómenos |
| `documentacion-v2/stage-05/PASO-4/inferencia-metadatos.md` | PASO-4: Inferencia de metadatos (status, horizon, scenario) |
| `documentacion-v2/stage-05/PASO-5/activacion-fenomenos.md` | PASO-5: Activación categórica, direccional y numérica |
| `documentacion-v2/stage-05/PASO-6/ensamblaje-output.md` | PASO-6: Ensamblaje del output final |
| `documentacion-v2/stage-05/AUDITORIA-stage-05-phenomena.md` | Auditoría con todos los hallazgos cerrados |

---

*Auditoría generada el 2026-07-15. Todos los hallazgos cerrados el 2026-07-15.*
