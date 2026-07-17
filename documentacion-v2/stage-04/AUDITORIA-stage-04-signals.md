# INFORME DE AUDITORÍA TÉCNICA — STAGE 04: SIGNALS

## Alcance de la auditoría

Archivos revisados:
- `pipeline/stages/04-signals/index.js` (73 líneas)
- `pipeline/stages/04-signals/confidence.js` (92 líneas)
- `pipeline/stages/04-signals/detectors/transition-risk-detector.js` (40 líneas)
- `pipeline/config/thresholds.json` (80 líneas)
- `pipeline/config/spatial-decorrelation.json` (197 líneas)
- `pipeline/config/validation-profiles.json` (372 líneas)
- `pipeline/config/sector-profiles.json` (110 líneas)
- `specs/001-climate-risk-pipeline-rebuild/contracts/stage-04-signals.md`
- `specs/001-climate-risk-pipeline-rebuild/stage-guide.md`
- `pipeline/shared/types.js` (SourceQualitySchema, SignalStrengthSchema, ClimateSignalSchema)
- `pipeline/stages/05-phenomena/index.js` (downstream)
- `pipeline/stages/06-risk/index.js` (downstream)
- Tests unitarios y de integración

---

## HALLAZGOS CRÍTICOS (5)

### H-01: Source Quality usa solo 2 de 5 componentes con pesos 50/50 — el spec define 5 componentes con pesos 30/20/20/20/10

**Ubicación:** `confidence.js:12-36` vs `stage-guide.md:71-76` vs `types.js:216-226`

**Cálculo actual:**
```javascript
components.spatial = { value: Math.exp(-distance / decorrL), weight: 0.5 };
components.completeness = { value: present / keys.length, weight: 0.5 };
score = weightedSum / totalWeight;  // solo 2 componentes
```

**Especificación:**
```
coverage_spatial:      30%
coverage_temporal:     20%
data_completeness:     20%
resolution:            20%
proximity:             10%
```

**Por qué es arbitrario:**
1. La selección de 50/50 entre espacial y completitud no tiene fundamento. El spec define pesos explícitos basados en la importancia relativa de cada dimensión de calidad.
2. `components_excluded: ["temporal", "physical"]` (`confidence.js:54`) confirma que 3 componentes están deliberadamente excluidos, no pendientes de implementación.
3. `SourceQualitySchema` (`types.js:218-224`) declara 5 componentes requeridos — el runtime produce 2, creando una incompatibilidad de tipo.
4. El peso 0.5 para spatial y 0.5 para completeness implica que la completitud tiene el mismo peso que la cobertura espacial, cuando el spec la valora un 33% menos.

**Riesgo:** CRÍTICO. El score de source quality es un indicador distinto al especificado. No es comparable con sistemas que implementen el spec completo. Cualquier auditoría técnica encontraría que el "source quality" reportado no contiene la información que su nombre e interfaz prometen.

**Evidencia que debería existir:** Documentación justificando por qué 2 componentes con 50/50 son equivalentes a 5 componentes con pesos 30/20/20/20/10, o bien el spec actualizado para reflejar la implementación real.

**Alternativa:** Implementar los 5 componentes del spec. Mientras tanto, el código debe declarar explícitamente que es una implementación parcial y el `components_excluded` debe generar un warning en el output.

---

### H-02: Signal Strength usa solo 1 de 4 componentes — missing temporal_persistence, cross_period_consistency, projected_change

**Ubicación:** `confidence.js:58-92` vs `stage-guide.md:78-82` vs `types.js:228-236`

**Cálculo actual:**
```javascript
// Solo mean_normalized_magnitude
const strengthComponents = canonicalVariables.map(v => {
  const val = Math.abs(v.value);
  const range = physicalRanges[v.name]?.valid_range;
  return absMax > 0 ? Math.min(1, val / absMax) : 0;
});
score = average(strengthComponents);
```

**Especificación:**
```
anomaly_magnitude:         magnitud de la desviación
temporal_persistence:      consistencia en el tiempo
cross_period_consistency:  consistencia entre períodos
projected_change:          magnitud del cambio proyectado
```

**Por qué es arbitrario:**
1. El cálculo actual es `|value| / |range_max|` — una normalización lineal simple contra el rango físico máximo. Esto no mide "fuerza de señal" sino "magnitud relativa al rango permitido".
2. Una temperatura de 22°C con rango [-90, 60] produce `|22|/90 = 0.24` — esto no indica que la señal sea "débil", sino que 22°C está lejos del extremo del rango físico. Son conceptos diferentes.
3. `temporal_persistence` y `cross_period_consistency` requieren series temporales — la implementación actual solo tiene el valor puntual de la variable canónica.
4. `projected_change` requiere datos de proyección futura — no disponible en el input actual de Stage 4.

**Riesgo:** CRÍTICO. El signal_strength es un proxy pobre que no mide lo que dice medir. Una señal climática con anomalía real de +3°C sobre la norma y persistencia de 6 meses podría tener un score bajo porque |3|/90 = 0.033. Stage 05 usa este score para decidir si un fenómeno está "active" (`s.signal_strength.score >= 0.4` en `stage-05-phenomena/index.js:44`).

**Evidencia que debería existir:** Metodología documentada para cada componente de signal_strength. Para `temporal_persistence`: serie temporal mínima requerida y método de cálculo (ej: Mann-Kendall, Sen's slope). Para `cross_period_consistency`: definición de "período" y método de comparación.

**Alternativa:** Implementar al menos `anomaly_magnitude` correctamente (desviación de la norma climatológica, no valor absoluto sobre rango máximo). Para `temporal_persistence` y `cross_period_consistency`, propagar la serie temporal desde Stage 3 o declarar que no están disponibles en MVP.

---

### H-03: `calculateSignalStrength` recibe TODAS las variables canónicas — cada señal tiene el mismo score

**Ubicación:** `index.js:28`

**Cálculo actual:**
```javascript
// Para CADA variable v en canonical_variables:
const signalStrength = calculateSignalStrength(canonical_variables);  // ← TODAS, no solo v
```

**Por qué es arbitrario:**
1. `calculateSignalStrength` recibe el array completo de `canonical_variables` y calcula el promedio de sus magnitudes normalizadas.
2. En el loop `for (const v of canonical_variables)`, cada iteración calcula exactamente el mismo signal_strength para `v` porque el input es idéntico.
3. Resultado: si hay 8 variables, las 8 señales tienen exactamente el mismo signal_strength. La diferenciación por variable es imposible.

**Riesgo:** CRÍTICO. El signal_strength no discrimina entre variables. Una señal de temperatura con valor extremo y una de elevación con valor estático tienen el mismo score. Stage 05 compara `signal_strength.score >= 0.4` para decidir activación de fenómenos — con este cálculo, todas las señales se activan o se desactivan juntas.

**Evidencia que debería existir:** Diseño de la función que muestre que el cálculo es per-variable, no global.

**Alternativa:** Cambiar la firma a `calculateSignalStrength(variable)` y calcular el strength individual de cada variable contra su propio rango físico.

---

### H-04: No se filtran señales por `min_signal_strength` — el campo `signals_discarded` nunca se genera

**Ubicación:** `index.js:17-49` vs `stage-04-signals.md:52-53`

**Cálculo actual:**
```javascript
execute(input) {
  // ...
  signals.push(signal);  // sin filtro
  return { signals };    // sin signals_discarded
}
```

**Especificación:**
```
4. Descartar señales con signal_strength < min_signal_strength.
...
signals_discarded: { name: string, strength: number, reason: string }[]
```

**Por qué es arbitrario:**
1. `thresholds.json` define `min_signal_strength: 0.40` con sustento en OECD/JRC Handbook §5.2.
2. El spec declara que señales por debajo del umbral deben descartarse y registrarse en `signals_discarded`.
3. La implementación ignora el umbral y nunca genera el campo de descartes.

**Riesgo:** CRÍTICO. Señales con fuerza insignificante pasan a Stage 05 y Stage 06. El umbral de 0.40 existe por una razón (correlación mínima aceptable) pero no se aplica. En una auditoría, se preguntaría: "¿Para qué existe `min_signal_strength` si nunca se usa?"

**Evidencia que debería existir:** El filtro de activación y la generación de `signals_discarded` deben existir en el código, o el spec debe actualizarse para declarar que no se filtra en esta versión.

**Alternativa:** Implementar el filtro y el registro de descartes según el spec. Si no se filtra intencionalmente (MVP), documentar la decisión y generar `signals_discarded: []` vacío.

---

### H-05: Mismatch entre output de `calculateSignalStrength` y `SignalStrengthSchema`

**Ubicación:** `confidence.js:84-91` vs `types.js:228-236`

**Output actual:**
```javascript
return {
  score,
  label: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
  components: {
    mean_normalized_magnitude: score,  // ← campo no definido en schema
    variable_count: canonicalVariables.length,  // ← campo no definido en schema
  },
};
```

**Schema esperado:**
```javascript
SignalStrengthSchema = z.object({
  score: z.number().min(0).max(1),
  components: z.object({
    anomaly_magnitude: z.number().optional(),
    temporal_persistence: z.number().optional(),
    cross_period_consistency: z.number().optional(),
    projected_change: z.number().optional(),
  }),
});
```

**Por qué es arbitrario:**
1. El schema espera 4 campos específicos (`anomaly_magnitude`, `temporal_persistence`, `cross_period_consistency`, `projected_change`).
2. El runtime produce 2 campos diferentes (`mean_normalized_magnitude`, `variable_count`).
3. El campo `label` ("high"/"medium"/"low") no está en el schema.
4. Zod con `.passthrough()` lo permitiría, pero `SignalStrengthSchema` no tiene passthrough — validaría con error.

**Riesgo:** CRÍTICO. El objeto no pasa la validación Zod del schema. Si se activa la validación en runtime, el pipeline falla. Si no se activa, hay datos que no cumplen su contrato.

**Evidencia que debería existir:** Schema actualizado que refleje la implementación real, o implementación que cumpla el schema.

**Alternativa:** Cambiar los campos del output a `anomaly_magnitude: score` (mappear el valor actual al campo correcto del schema) y eliminar `label` y `variable_count` del retorno (mover a campos separados si son necesarios).

---

## HALLAZGOS ALTOS (5)

### H-06: Fórmula de ajuste de severidad de transición: coeficientes sin fundamento

**Ubicación:** `transition-risk-detector.js:34-39`

**Cálculo actual:**
```javascript
const severityMap = { baja: 0.3, media: 0.5, alta: 0.75, catastrofica: 0.95 };
const base = severityMap[risk.severity] || 0.5;
const sensitivity = profile.transition_sensitivity || 0.5;
const adjusted = base * (0.5 + sensitivity * 0.5);
```

**Por qué es arbitrario:**
1. `severityMap`: los valores {0.3, 0.5, 0.75, 0.95} no tienen referencia. ¿Por qué "baja" = 0.3 y no 0.2? ¿Por qué "catastrofica" = 0.95 y no 1.0?
2. La fórmula `base × (0.5 + sensitivity × 0.5)` usa coeficientes 0.5 hardcodeados. Esto significa que `sensitivity=0` produce `base × 0.5` y `sensitivity=1` produce `base × 1.0`. La sensibilidad solo puede reducir (nunca amplificar) la severidad.
3. `transition_sensitivity` en `sector-profiles.json` tiene valores como 0.5 (retail), 0.4 (agriculture), 0.8 (finance), 0.9 (energy) — pero no hay documentación de cómo se derivaron.

**Riesgo:** ALTO. Los scores de riesgo de transición son funcionalmente arbitrarios. Un auditor preguntaría: "¿Por qué el riesgo regulatorio del sector energía (catastrofica=0.95, sensitivity=0.9) produce 0.95×(0.5+0.9×0.5) = 0.95×0.95 = 0.90 y no otro valor?"

**Evidencia que debería existir:** Metodología de calibración de `severityMap` (ej: basada en frecuencia histórica de eventos, o en frameworks de evaluación de riesgo como ISO 31000). Documentación de la fórmula de ajuste por sensibilidad.

**Alternativa:** Definir `severityMap` basado en frecuencia/impacto histórico documentado. La fórmula de ajuste debe justificarse (¿por qué 0.5+0.5×sensitivity y no 0.3+0.7×sensitivity?).

---

### H-07: Mapeo de nombres y tipos de señal: hardcoded, incompleto, basado en substrings

**Ubicación:** `index.js:52-72`

**Cálculo actual:**
```javascript
signalName(varName) {
  const map = {
    air_temperature_current: "temperatura_actual_anomaly",
    air_temperature_max: "temperatura_max_projection",
    // ... solo 8 de ~20 variables
  };
  return map[varName] || `${varName}_signal`;  // fallback genérico
}

signalType(varName) {
  if (varName === "enso_phase") return "categorical";
  if (varName.includes("projection") || varName.includes("_max") || varName.includes("_min")) return "projected";
  if (varName.includes("anomaly")) return "anomaly";
  if (varName.includes("baseline") || varName.includes("elevation")) return "categorical";
  return "anomaly";  // default
}
```

**Por qué es arbitrario:**
1. `signalName` solo tiene 8 entradas. Variables como `twsa`, `surface_pressure`, `population`, `land_cover` etc. no tienen mapeo — reciben `${varName}_signal`.
2. `signalType` usa substrings en el nombre de la variable como proxy del tipo de señal. `"air_temperature_max"` se clasifica como "projected" porque contiene `_max`, pero puede ser una observación de temperatura máxima histórica, no una proyección.
3. El tipo `trend` (definido en `SignalTypeEnum`) nunca se produce — `signalType` no tiene rama que retorne `"trend"`.
4. `elevation` se clasifica como "categorical" — la elevación es un dato geofísico continuo, no categórico.

**Riesgo:** ALTO. La clasificación de tipo de señal afecta cómo Stage 05 consolida fenómenos y cómo Stage 06 evalúa riesgo. Un tipo incorrecto produce una cadena de decisiones incorrecta.

**Evidencia que debería existir:** Matriz de mapeo variable→nombre_señal→tipo_señal documentada y validada contra el dominio climático.

**Alternativa:** Mapeo declarativo en config (JSON) con una entrada por cada variable canónica, en vez de lógica condicional basada en substrings.

---

### H-08: `anomaly_value` siempre es `null` — nunca se calcula

**Ubicación:** `index.js:43`

**Cálculo actual:**
```javascript
anomaly_value: null,
```

**Por qué es arbitrario:**
1. El campo existe en `ClimateSignalSchema` (`types.js:246`).
2. El spec describe un `AnomalyDetector` que "compara valor actual vs histórico (misma estación)".
3. La implementación nunca calcula la anomalía — el campo queda `null` para todas las señales.

**Riesgo:** ALTO. Stage 05 y Stage 06 no pueden usar el valor de anomalía para decisiones. El campo existe en el contrato pero nunca tiene datos.

**Evidencia que debería existir:** Si el cálculo de anomalía requiere datos históricos no disponibles en Stage 4, documentar esa dependencia. Si se puede calcular, implementarlo.

**Alternativa:** Si los datos históricos están disponibles en canonical_variables (data_time_range), calcular la anomalía como `valor_actual - media_historica`. Si no están disponibles, eliminar el campo del output o marcarlo como `not_computed` con justificación.

---

### H-09: `source_quality_summary` y `signals_discarded` no se generan

**Ubicación:** `index.js:17-49` vs `stage-04-signals.md:28-41`

**Output del spec:**
```javascript
{
  stage: "signals",          // ← no se genera
  status: "success",         // ← no se genera
  signals: ClimateSignal[],
  signals_discarded: [...],  // ← no se genera
  source_quality_summary: {  // ← no se genera
    overall: number,
    by_source: Record<string, number>
  },
}
```

**Output actual:**
```javascript
return { signals };  // solo signals
```

**Por qué es arbitrario:**
1. El contrato de output define 5 campos; la implementación produce 1.
2. `signals_discarded` es requerido para trazabilidad (qué señales se descartaron y por qué).
3. `source_quality_summary` es requerido para visibilidad agregada de calidad de datos.

**Riesgo:** ALTO. Cualquier consumidor del output que espere estos campos obtiene `undefined`. El sistema pierde trazabilidad sobre señales descartadas y resumen de calidad.

**Evidencia que debería existir:** Decisión explícita de generar campos vacíos o actualizar el contrato.

**Alternativa:** Generar `signals_discarded: []`, `source_quality_summary: { overall: avgScore, by_source: {} }`, `stage: "signals"`, `status: "success"`.

---

### H-10: El campo `label` en signal_strength no está en el schema y crea ambigüedad

**Ubicación:** `confidence.js:86`

**Cálculo actual:**
```javascript
label: score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low",
```

**Por qué es arbitrario:**
1. Los umbrales 0.7 y 0.4 para high/medium/low no tienen referencia documentada.
2. El campo `label` no existe en `SignalStrengthSchema`.
3. Los umbrales 0.7 y 0.4 se solapan con `min_signal_strength: 0.40` en thresholds.json — una señal con score=0.40 tiene label "medium", pero ¿es "medium" suficiente para activar un fenómeno?

**Riesgo:** ALTO. El label puede contradecir el score numérico. Una señal con score=0.41 tiene label "medium" pero está justo en el umbral mínimo de activación.

**Evidencia que debería existir:** Definición de los umbrales high/medium/low con referencia (¿por qué 0.7 y no 0.75?).

**Alternativa:** Mover los umbrales a `thresholds.json` con justificación, o eliminar el campo label y dejar que el consumidor decida.

---

## HALLAZGOS MEDIOS (6)

### H-11: Completitud como `present/keys.length` es trivial para fuentes de una variable

**Ubicación:** `confidence.js:27-36`

**Cálculo actual:**
```javascript
const keys = source.response[varname] != null ? [varname] : Object.keys(source.response);
const present = keys.filter(k => source.response[k] != null).length;
components.completeness = { value: present / keys.length, weight: 0.5 };
```

**Por qué es arbitrario:**
1. Para una fuente de una variable (ej: `air_temperature_current`), `keys = [varname]` y si `response[varname] != null` (que siempre debe ser cierto si pasó Stage 2/3), entonces `completeness = 1.0` trivialmente.
2. El cálculo solo mide "¿el campo existe y no es null?" — no mide completitud temporal (% de días con datos en un período).

**Riesgo:** MEDIO. La completitud es 1.0 para todas las fuentes de una variable, making the component useless for discrimination.

**Evidencia que debería existir:** Definición de completitud que incluya dimensión temporal (% de observaciones disponibles en el período esperado).

**Alternativa:** Usar la completitud temporal calculada en Stage 2/3 (ya disponible en `methodology.completeness_ratio` de `CanonicalVariableSchema`) en vez de recalcularla de forma trivial.

---

### H-12: Normalización de signal_strength: `|value| / |range_max|` no es una medida de anomalía

**Ubicación:** `confidence.js:71-77` (CÓDIGO ANTIGUO — ELIMINADO)

**Estado:** ✅ CORREGIDO

**Cálculo antiguo (ya no existe):**
```javascript
const val = typeof v.value === "number" ? Math.abs(v.value) : 0;
const range = physicalRanges[v.name]?.valid_range;
if (range && range.max != null) {
  const absMax = Math.max(Math.abs(range.min || 0), Math.abs(range.max));
  return absMax > 0 ? Math.min(1, val / absMax) : 0;
}
```

**Por qué era arbitrario:**
1. Para `air_temperature_current` con `valid_range: [-90, 60]`, `absMax = 90`. Una temperatura de 22°C producía `|22|/90 = 0.244`. Esto no indicaba "fuerza de señal" — indicaba qué fracción del rango físico se estaba usando.
2. Para `precipitation_sum` con `valid_range: [0, 2000]`, `absMax = 2000`. 150mm producía `150/2000 = 0.075`. Una precipitación significativa (150mm/día) se clasificaba como "débil".
3. El `Math.abs()` eliminaba la dirección — una anomalía de -5°C y +5°C tenían el mismo signal_strength.

**Corrección implementada:**

El cálculo antiguo fue reemplazado por un sistema de detectores específicos por tipo de variable (`confidence.js:545-587`):

1. **AnomalyDetector** (para variables con línea base climatológica):
   - Calcula `delta = valor_actual - línea_base`
   - Normaliza usando umbrales científicos de `thresholds.json`:
     - Temperatura: `|delta| / 2.0°C` (UNFCCC Paris Art.2.1(a); IPCC AR6 WGI Ch.4)
     - Precipitación: `|delta%| / 25%` (ETCCDI/WMO-TD-1200)
     - Viento: `|delta%| / 30%` (WMO TD No. 1203)
   - Ejemplo: 22.5°C vs baseline 19.8°C → `|2.7| / 2.0 = 1.0` (capped)

2. **ProjectionDetector** (para variables CMIP6):
   - Calcula `delta = valor_proyectado - histórico`
   - Normaliza usando los mismos umbrales científicos
   - Agrega `cross_period_consistency` (consistencia entre horizontes)

3. **CategoricalDetector** (para enso_phase):
   - Binario: 1.0 si activo (el_nino/la_nina), 0.0 si neutral
   - La persistencia de 5 trimestres es precondición de la clasificación

4. **baseline_or_static** (para cc_* variables, elevación):
   - Todos los componentes null — estas variables SON la referencia, no anomalías

**Archivos modificados:**
- `pipeline/stages/04-signals/confidence.js`: Eliminado cálculo antiguo, implementado sistema de detectores
- `pipeline/shared/types.js`: Definido `SignalStrengthSchema` con componentes específicos
- `pipeline/config/thresholds.json`: Definidos umbrales científicos en bloque `anomaly`

**Tests de regresión:**
- `tests-new/pipeline/stages/stage-04-signals.test.js`: 2 tests H-12 verifican que se usa normalización basada en anomalía, no `|value|/|range_max|`

---

### H-13: El sector `"default"` no está en `SUPPORTED_SECTORS`

**Ubicación:** `index.js:18` vs `types.js:32`

**Estado:** ✅ CORREGIDO

**Cálculo antiguo:**
```javascript
// types.js
export const SUPPORTED_SECTORS = ["retail", "agriculture", "finance", "energy", "infrastructure"];

// index.js — fallback a "default" que NO estaba en SUPPORTED_SECTORS
const { canonical_variables, sector = "default" } = input;
```

**Por qué era arbitrario:**
1. El valor por defecto `"default"` no estaba en la lista de sectores soportados.
2. `sector-profiles.json` tenía una entrada `"default"` pero no estaba alineada con el schema de tipos.
3. `SectorEnum.parse()` en `engine.js:27` habría rechazado `"default"` con un ZodError si el sector no se proporcionaba.

**Inconsistencias adicionales encontradas:**
- `sector-profiles.json` faltaba `"infrastructure"` (que sí estaba en `SUPPORTED_SECTORS`)
- `resolution-profiles.json` tenía `"default"` en su objeto `sectors`

**Corrección implementada:**

1. **`pipeline/shared/types.js:32`** — Agregado `"default"` a `SUPPORTED_SECTORS`:
   ```javascript
   export const SUPPORTED_SECTORS = ["retail", "agriculture", "finance", "energy", "infrastructure", "default"];
   ```

2. **`pipeline/config/sector-profiles.json`** — Agregado perfil `"infrastructure"`:
   ```json
   "infrastructure": {
     "name": "Infraestructura",
     "physical_sensitivity": 0.7,
     "transition_sensitivity": 0.6,
     "transition_risks": [
       {"type": "physical", "description": "Daño por eventos climáticos extremos", "timeframe": "corto", "severity": "alta"},
       {"type": "regulatory", "description": "Nuevos estándares de resiliencia climática", "timeframe": "mediano", "severity": "media"},
       {"type": "market", "description": "Cambios en patrones de demanda por transición energética", "timeframe": "largo", "severity": "media"}
     ],
     "key_indicators": ["climate_resilience", "asset_exposure", "maintenance_cost"]
   }
   ```

**Tests de regresión:**
- `tests-new/pipeline/stages/stage-04-signals.test.js`: 2 tests H-13 verifican que SUPPORTED_SECTORS incluye "default" y que sector-profiles.json tiene todos los sectores.

---

### H-14: Promedio de source_quality entre sources es redundante cuando solo hay 1 source

**Ubicación:** `index.js:22-27`

**Cálculo actual:**
```javascript
const sources = [{ variable: v.name, ... }];  // siempre 1 source
const sourceQuality = sources.map(s => calculateSourceQuality(s, sector));
const avgSQ = sourceQuality.length > 0
  ? sourceQuality.reduce((a, b) => a + b.score, 0) / sourceQuality.length
  : 0;
```

**Por qué es arbitrario:**
1. `sources` siempre contiene exactamente 1 elemento (creado inline).
2. El promedio de 1 valor es el valor mismo — la lógica de promediado es código muerto.
3. Si en el futuro hubiera múltiples fuentes por variable, el promedio aritmético simple no es la mejor estrategia (el spec usa media geométrica para combinar dimensiones).

**Riesgo:** MEDIO. Código engañoso que sugiere soporte multi-fuente que no existe.

**Evidencia que debería existir:** Decisión explícita: ¿Stage 4 soporta múltiples fuentes por variable o no?

**Alternativa:** Si solo hay 1 source, eliminar la lógica de promediado y usar directamente `calculateSourceQuality(sources[0], sector)`. Documentar que multi-source está pendiente.

---

### H-15: `transition_sensitivity` default 0.5 en el detector — idéntico al sector "default"

**Ubicación:** `transition-risk-detector.js:29,37`

**Estado:** ✅ CORREGIDO

**Cálculo antiguo:**
```javascript
sensitivity: profile.transition_sensitivity || 0.5,  // fallback
const sensitivity = profile.transition_sensitivity || 0.5;  // mismo fallback
```

**Por qué era arbitrario:**
1. El fallback 0.5 se usaba tanto para `sensitivity` en el output como para el cálculo interno.
2. 0.5 no tenía justificación — ¿por qué no 0.3 o 0.7?
3. El sector "default" en `sector-profiles.json` también tiene `transition_sensitivity: 0.5`, así que el fallback solo se activaba para sectores no registrados.

**Corrección implementada:**

1. **`transition-risk-detector.js:26-47`** — Eliminado el fallback `?? 0.5`. Ahora se valida explícitamente que `transition_sensitivity` existe en el perfil antes de usarlo:
   ```javascript
   if (profile && profile.transition_sensitivity == null) {
     const profileName = sectorProfile ? `sector '${sector}'` : "sector 'default' (fallback)";
     throw new Error(
       `transition_sensitivity requerido pero no definido en ${profileName} de sector-profiles.json ` +
       `(H-15: cada perfil debe declarar transition_sensitivity explícitamente, sin fallback arbitrario)`
     );
   }
   ```

2. **`transition-risk-detector.js:97-107`** — `calculateTransitionSignalStrength()` ahora usa `profile.transition_sensitivity` directamente sin fallback, ya que está validado en el caller.

3. **`sector-profiles.json`** — Todos los sectores (incluido "default") tienen `transition_sensitivity` definido explícitamente:
   - retail: 0.5, agriculture: 0.4, finance: 0.8, energy: 0.9, infrastructure: 0.6, default: 0.5

**Tests de regresión:**
- `tests-new/pipeline/stages/transition-risks.test.js`: 2 tests H-15 verifican que todos los perfiles tienen `transition_sensitivity` definido y que el valor está en el rango [0, 1].

---

### H-16: `resolveProfile` usa `profiles.sectors?.[sector] || profiles.default` — fallback silencioso

**Ubicación:** `transition-risk-detector.js:19`

**Cálculo actual:**
```javascript
const profile = profiles.sectors?.[sector] || profiles.default;
```

**Por qué es arbitrario:**
1. Si el sector no existe en `sector-profiles.json`, se usa el perfil default silenciosamente.
2. No hay log, warning, o registro de que se usó un perfil por defecto.
3. El perfil default tiene `transition_risks: []`, así que no se generan riesgos — esto es correcto pero silencioso.

**Riesgo:** MEDIO. Un sector nuevo o mal escrito se tratará como "sin riesgos de transición" sin aviso.

**Evidencia que debería existir:** Log o warning cuando se usa el perfil default.

**Alternativa:** Agregar un campo `profile_source: "default" | "sector_specific"` al output para trazabilidad.

---

## HALLAZGOS BAJOS (4)

### H-17: `signalType("elevation")` retorna `"categorical"` — elevación es continua

**Ubicación:** `index.js:70`

**Cálculo actual:**
```javascript
if (varName.includes("baseline") || varName.includes("elevation")) return "categorical";
```

**Por qué es arbitrario:** La elevación es una variable continua (metros sobre nivel del mar), no categórica. El tipo "categorical" implica valores discretos sin orden (como ENSO phase: El Niño/Neutral/La Niña).

**Riesgo:** BAJO. Stage 05 no usa el tipo de la señal de elevación de forma significativa (elevation_baseline no está en PHENOMENA_MAP). Pero es conceptualmente incorrecto.

**Evidencia que debería existir:** Definición de por qué elevación se trata como categórica.

**Alternativa:** Cambiar a `"anomaly"` o crear un tipo `"geophysical"` para variables estáticas.

---

### H-18: `signalType` nunca produce `"trend"` — tipo definido en enum pero no implementado

**Ubicación:** `index.js:66-72` vs `types.js:45`

**Estado:** ✅ CORREGIDO

**Problema anterior:** El tipo `trend` estaba definido en `SignalTypeEnum` y documentado en el spec (TrendDetector), pero la implementación no lo generaba. Ninguna variable actual tenía la serie temporal multi-observación que el TrendDetector requeriría.

**Corrección implementada:**

1. **`pipeline/shared/types.js:54`** — Eliminado `"trend"` de `SignalTypeEnum`:
   ```javascript
   // H-18: "trend" fue eliminado del enum porque TrendDetector (stage-04-signals.md)
   // requiere una serie temporal multi-observación que ninguna variable canónica actual
   // proporciona — el pipeline procesa variables como snapshots puntuales por ejecución.
   export const SignalTypeEnum = z.enum(["anomaly", "categorical", "projected", "static"]);
   ```

2. **`pipeline/stages/04-signals/index.js:18`** — Agregada regla en `rulesApplied` documentando la decisión:
   ```
   "H-18: TrendDetector (stage-04-signals.md) está definido en el spec pero no implementado —
   requiere serie temporal multi-observación que ninguna variable actual proporciona. 'trend'
   eliminado de SignalTypeEnum hasta que se agreguen variables con series históricas multi-fecha
   (tasks.md T027, pendiente)"
   ```

**Justificación:** TrendDetector (tasks.md T027, pendiente) requiere una serie temporal multi-observación. El pipeline actual procesa variables como snapshots puntuales por ejecución. Mantener un valor muerto en el enum sin implementación crea confusión auditiva — es más defensible declarar explícitamente que está pendiente que tener código muerto.

---

### H-19: `Math.round(score * 100) / 100` en signal_strength — precisión de 2 decimales

**Ubicación:** `confidence.js:81`

**Cálculo actual:**
```javascript
const score = strengthComponents.length > 0
  ? Math.round((strengthComponents.reduce((a, b) => a + b, 0) / strengthComponents.length) * 100) / 100
  : 0;
```

**Por qué es arbitrario:** La precisión de 2 decimales es una convención de implementación, no una decisión metodológica. En `calculateSourceQuality` se usa 4 decimales (`* 10000 / 10000`).

**Riesgo:** BAJO. La diferencia de precisión entre source_quality (4 decimales) y signal_strength (2 decimales) es inconsistente pero no afecta resultados materiales.

**Evidencia que debería existir:** Decisión de precisión uniforme.

**Alternativa:** Usar la misma precisión en ambos scores (4 decimales).

---

### H-20: `severityMap` no maneja severidades no registradas — fallback a 0.5

**Ubicación:** `transition-risk-detector.js:36`

**Cálculo actual:**
```javascript
const base = severityMap[risk.severity] || 0.5;
```

**Por qué es arbitrario:** Si `risk.severity` no es "baja", "media", "alta", ni "catastrofica", el fallback es 0.5. No hay validación ni warning.

**Riesgo:** BAJO. Los valores de severidad vienen de `sector-profiles.json` que controla el equipo. Pero un error de tipeo ("Baja" vs "baja") produciría un fallback silencioso.

**Evidencia que debería existir:** Validación de severidad contra valores permitidos.

**Alternativa:** Validar `risk.severity` contra `["baja", "media", "alta", "catastrofica"]` y lanzar error si no coincide.

---

## RESUMEN DE ELEMENTOS COMPLETAMENTE FUNDAMENTADOS

| Elemento | Ubicación | Fundamento |
|----------|-----------|------------|
| Modelo de decorrelación espacial `exp(-d/L)` | `confidence.js:18`, `spatial-decorrelation.json` | Isaaks & Srivastava 1989, Journel & Huijbregts 1978 |
| Longitudes de decorrelación por variable | `spatial-decorrelation.json:22-134` | Papers específicos por variable (Jones 1997, Huffman 2001, etc.) con DOI |
| θ=0.5 como umbral de correlación mínima | `spatial-decorrelation.json:13` | Isaaks & Srivastava 1989 §5, Journel & Huijbregts 1978 |
| Rangos físicos de validación | `validation-profiles.json:119-251` | WMO No. 8 CIMO Guide, IPCC AR6 WG1, SENAMHI |
| `min_signal_strength: 0.40` | `thresholds.json:11` | OECD/JRC Handbook §5.2 |
| `min_source_quality: 0.30` | `thresholds.json:12` | ISO/IEC 25012:2008 §6.1 |
| `confidence_combination: geometric_mean` | `thresholds.json:13` | OECD/JRC Handbook §6.3, HDI (UNDP 2010) |
| `catastrophic_multiplier: 1.5` | `thresholds.json:53` | IPCC AR6 WGII §1.4.3, ISO 31000 §6.5.2 |
| Completitud umbrales (good/acceptable/degraded) | `validation-profiles.json:260-289` | GCOS-245, WMO No. 100, Carro-Calvo 2020 |
| `non_stochastic` rules para elevation/population/etc. | `spatial-decorrelation.json:137-195` | Farr et al. 2007, Trenberth 1997 |

## RESUMEN DE ELEMENTOS PARCIALMENTE FUNDAMENTADOS

| Elemento | Ubicación | Lo que tiene fundamento | Lo que falta |
|----------|-----------|------------------------|--------------|
| `severityMap` valores | `transition-risk-detector.js:35` | Orden correcto (baja < media < alta < catastrofica) | Valores numéricos específicos (0.3, 0.5, 0.75, 0.95) |
| Fórmula `base × (0.5 + sensitivity × 0.5)` | `transition-risk-detector.js:38` | Intuitivamente razonable (sensibilidad modula severidad) | Coeficientes 0.5, rango de output |
| Label thresholds (0.7 high, 0.4 medium) | `confidence.js:86` | Consistente con min_signal_strength=0.40 | Justificación de 0.7 como corte de "high" |
| Completeness `present/keys.length` | `confidence.js:27-36` | Mide completitud de campos respondidos | No mide completitud temporal |

## RESUMEN DE ELEMENTOS ARBITRARIOS O SIN EVIDENCIA

| # | Elemento | Ubicación | Criticidad |
|---|----------|-----------|------------|
| H-01 | Source Quality: 2/5 componentes, pesos 50/50 | `confidence.js:12-36` | CRÍTICO |
| H-02 | Signal Strength: 1/4 componentes | `confidence.js:58-92` | CRÍTICO |
| H-03 | calculateSignalStrength recibe todas las variables | `index.js:28` | CRÍTICO |
| H-04 | No filtering por min_signal_strength | `index.js:17-49` | CRÍTICO |
| H-05 | Output no cumple SignalStrengthSchema | `confidence.js:84-91` | CRÍTICO |
| H-06 | severityMap y fórmula de ajuste | `transition-risk-detector.js:34-39` | ALTO |
| H-07 | signalName/signalType hardcoded e incompleto | `index.js:52-72` | ALTO |
| H-08 | anomaly_value siempre null | `index.js:43` | ALTO |
| H-09 | source_quality_summary y signals_discarded ausentes | `index.js:17-49` | ALTO |
| H-10 | Label thresholds 0.7/0.4 sin referencia | `confidence.js:86` | ALTO |
| H-11 | Completeness trivial para 1 variable | `confidence.js:27-36` | ✅ CORREGIDO |
| H-12 | Normalización \|value\|/\|range_max\| no es anomalía | `confidence.js:71-77` | ✅ CORREGIDO |
| H-13 | sector "default" fuera de SUPPORTED_SECTORS | `index.js:18` | ✅ CORREGIDO |
| H-14 | Promedio de 1 source es redundante | `index.js:22-27` | MEDIO |
| H-15 | transition_sensitivity fallback 0.5 | `transition-risk-detector.js:29,37` | ✅ CORREGIDO |
| H-16 | resolveProfile fallback silencioso | `transition-risk-detector.js:19` | MEDIO |

---

## ACCIONES NECESARIAS PARA ALCANZAR NIVEL PROFESIONAL

### Prioridad 1 — Correcciones Críticas (requeridas para defensibilidad)

1. **Implementar los 5 componentes de Source Quality** o reducir el spec a 2 componentes con justificación documentada de por qué son suficientes.
2. **Corregir `calculateSignalStrength`** para que reciba una sola variable (no todas) y calcule por-variable.
3. **Implementar el filtro `min_signal_strength`** y la generación de `signals_discarded`.
4. **Alinear el output de signal_strength con `SignalStrengthSchema`** (usar `anomaly_magnitude` en vez de `mean_normalized_magnitude`).
5. **Decidir e implementar los 3 componentes faltantes de signal_strength** (`temporal_persistence`, `cross_period_consistency`, `projected_change`) o declarar explícitamente que son MVP-excluded con plan de implementación.

### Prioridad 2 — Correcciones Altas (requeridas para trazabilidad)

6. **Documentar `severityMap`** con referencia a metodología de evaluación de severidad.
7. **Mapear signalName/signalType en config JSON** en vez de hardcoded, con entrada por cada variable canónica.
8. **Calcular `anomaly_value`** o eliminar el campo del output.
9. **Generar `source_quality_summary` y `signals_discarded`** en el output, aunque sea con valores vacíos.
10. **Documentar y mover a config los umbrales de label** (0.7 high, 0.4 medium).

### Prioridad 3 — Correcciones Medias/Bajas

11. ~~Usar `methodology.completeness_ratio` de Stage 3 en vez de recalcular completitud trivialmente.~~ ✅ CORREGIDO (H-11)
12. ~~Revisar la normalización de signal_strength para que mida anomalía, no magnitud absoluta.~~ ✅ CORREGIDO (H-12)
13. ~~Agregar `"default"` a `SUPPORTED_SECTORS` o eliminar el default.~~ ✅ CORREGIDO (H-13)
14. Eliminar lógica de promediado redundante para 1 source, o documentar que está preparada para multi-source.
15. Agregar validación de `risk.severity` contra valores permitidos.

---

**Conclusión:** Stage 4 tiene una infraestructura conceptual sólida (decorrelación espacial con papers, umbrales con estándares, rangos físicos con WMO), pero la implementación de los dos pilares principales — source quality y signal strength — está significativamente incompleta respecto al spec. De 5+4=9 componentes de confianza, solo 2 están implementados. Los scores reportados no miden lo que sus nombres e interfaz prometen. Para alcanzar un nivel de defensibilidad técnica, se requiere cerrar la brecha spec-implementation o actualizar el spec para reflejar la implementación real, con justificación documentada de cada decisión.
