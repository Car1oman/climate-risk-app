# PASO-5 — Activación de Fenómenos

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | Bloque de activación en `execute()` (index.js:183-218) |
| **Ubicación** | `pipeline/stages/05-phenomena/index.js` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la lógica de activación de fenómenos: categórica, direccional y numérica |

---

## 1. Resumen Ejecutivo

PASO-5 determina si un fenómeno está "activo" basándose en el tipo de activación definido para ese fenómeno. Hay tres tipos: (1) categórica — comparación exacta de valor (ENSO), (2) direccional — señal con SS ≥ umbral Y signo de anomaly_value consistente con la dirección física, (3) numérica — señal con SS ≥ umbral (fallback, hoy sin uso).

---

## 2. Tipos de activación

### 2.1 Categórica (`matchValue != null`)

**Fenómenos**: el_nino, la_nina

```javascript
active = matchingSignals.some(s => {
  if (entry.allowedValues && !entry.allowedValues.includes(s.value)) {
    return false;  // H-5.8: validación defensiva de valores permitidos
  }
  return s.value === entry.matchValue;
});
```

**Lógica**: Compara `s.value` con `matchValue` exacto. Si `allowedValues` está definido, primero valida que el valor esté en la lista permitida — valores no permitidos se ignoran (no activan).

**H-5.8**: La comparación es exacta (sin normalización de caso) porque `enso-classification.js` produce exactamente 3 valores: "el_nino", "la_nina", "neutral". Normalizar caso enmascararía bugs upstream.

**Evidencia**: `Comparación categórica: matchValue="el_nino". Valores de señales: [enso_phase_categorical="el_nino"]. Valores permitidos: [el_nino, la_nina, neutral].`

### 2.2 Direccional (`sign != null`)

**Fenómenos**: ola_de_calor (sign: positive), ola_de_frio (sign: negative), sequia (sign: negative), inundacion (sign: positive)

```javascript
active = matchingSignals.some(s =>
  s.signal_strength.score >= minPhenomenonActivation &&
  s.anomaly_value != null &&
  (entry.sign === "positive" ? s.anomaly_value > 0 : s.anomaly_value < 0)
);
```

**H-5.1**: La dirección física es crítica — un déficit de precipitación activa sequía, un exceso activa inundación. Sin el filtro de signo, ambos activarían el mismo fenómeno con la misma magnitud.

**H-5.7**: `minPhenomenonActivation` es un umbral separado de `min_signal_strength`. El primero determina si el fenómeno tiene suficiente evidencia; el segundo filtra señales individuales en Stage 4.

**Evidencia**: `Activación direccional: sign="negative", umbral SS=0.40. Detalle por señal: precipitacion_projection: SS=0.60, anomaly=-35.5.`

### 2.3 Numérica (fallback, `sign == null && matchValue == null`)

**Fenómenos**: Ninguno actualmente (todas las definiciones activas fijan matchValue o sign).

```javascript
active = matchingSignals.some(s => s.signal_strength.score >= minPhenomenonActivation);
```

**Lógica**: Activación simple por SS ≥ umbral. Sin filtro de dirección ni de valor categórico.

---

## 3. Umbral de activación de fenómeno

**H-5.7**: `minPhenomenonActivation` (thresholds.json: 0.40) es conceptualmente distinto de `min_signal_strength` (0.40):

| Umbral | ¿Qué filtra? | ¿Dónde? |
|--------|--------------|---------|
| `min_signal_strength` (0.40) | Señales individuales — ¿esta señal es suficientemente fuerte? | Stage 4 (filtro de entrada a Stage 5) |
| `min_phenomenon_activation` (0.40) | Fenómenos completos — ¿este fenómeno tiene suficiente evidencia? | Stage 5 (decisión de activación) |

**Default**: `min_phenomenon_activation = min_signal_strength` para compatibilidad hacia atrás. Pero son campos separados porque podrían divergir: un fenómeno podría requerir más evidencia (SS ≥ 0.6) o aceptar menos (SS ≥ 0.3).

**Operador `some()`**: Se mantiene porque el contrato (Rule 1) establece que una señal requerida es suficiente para considerar el fenómeno. Si se requiriera mayoría → cambiar a `filter().length >= ceil(n/2)`.

---

## 4. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.1 (ALTO): Composición de fenómenos sin justificación | phenomenon-definitions.json con scientific_reference |
| H-5.7 (MEDIO): Umbral reutilizado para activación | min_phenomenon_activation separado en thresholds.json |
| H-5.8 (BAJO): Validación ENSO | allowedValues con validación defensiva |
