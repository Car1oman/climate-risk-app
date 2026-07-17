# PASO-3 — Cálculo de Probabilidad

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateProbability()`, `getExternalProbability()` |
| **Ubicación** | `pipeline/stages/06-risk/index.js:327-421` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del cálculo de probabilidad (P) con prioridad de fuente externa (GRI Oxford) sobre cálculo interno (confidence.combined), y mapeo a escala Likert 1-5 |

---

## 1. Resumen Ejecutivo

calculateProbability() busca primero una probabilidad de ocurrencia anual externa (GRI Oxford) para el fenómeno. Si existe, la mapea a 1-5 con la tabla confidence_to_probability. Si no existe, calcula internamente desde confidence.combined (geometric mean de SQ × SS) usando la misma tabla. La reutilización de la misma tabla para ambas fuentes es una simplificación deliberada documentada con su vacío de calibración.

---

## 2. Flujo detallado

### 2.1 Búsqueda de probabilidad externa (H-6.9)

```javascript
const external = this.getExternalProbability(phenomenon, canonicalVariables);
if (external) {
  let value = 1;
  for (const [threshold, prob] of mapping) {
    if (external.probability01 >= threshold) value = prob;
  }
  return { value, source: "external", external_source: `gri_oxford:${external.canonicalName}`, ... };
}
```

**Lógica**: getExternalProbability() busca en canonical_variables la variable canónica correspondiente según PHENOMENON_TO_EXTERNAL_PROBABILITY (sequia→gri_drought_occurrence, inundacion→gri_flood_occurrence, ola_de_calor→gri_extreme_heat_occurrence). Si el fenómeno no tiene mapeo o la variable no está en canonical_variables, retorna null y se procede al cálculo interno.

**LIMITACIÓN DECLARADA**: Stage 03 actualmente NO extrae gri_flood_occurrence/gri_drought_occurrence/gri_extreme_heat_occurrence de la respuesta cruda de GRI Oxford — solo extrae traveltime_healthcare. En la práctica, canonical_variables nunca traerá estos valores hasta que se resuelva ese gap. Ver HALLAZGO-4 en documentacion-v2/stage-02.

### 2.2 Cálculo interno desde confidence.combined (H-5.13)

```javascript
const score = phenomenon.confidence?.combined ?? 0;
let value = 1;
for (const [threshold, prob] of mapping) {
  if (score >= threshold) value = prob;
}
```

**Fórmula**: `P = mapping_lookup(combined)` donde mapping = [[0.0,1],[0.2,2],[0.4,3],[0.6,4],[0.8,5]].

**Semántica del bucle**: Para cada par [threshold, prob], si score ≥ threshold, se actualiza value. El resultado es el último threshold superado — equivalente a un escalón (step function).

### 2.3 Tabla de conversión

| confidence.combined | P (Likert) | Etiqueta |
|---------------------|-----------|----------|
| [0.0, 0.2) | 1 | muy improbable |
| [0.2, 0.4) | 2 | improbable |
| [0.4, 0.6) | 3 | posible |
| [0.6, 0.8) | 4 | probable |
| [0.8, 1.0] | 5 | muy probable |

**Fundamento**: Espaciado uniforme cada 0.2 — Principio de indiferencia de Laplace / máxima entropía para una escala ordinal 1-5 sin información adicional. NO es una calibración empírica (H-6.7).

**Efecto de umbral**: Función escalón deliberada — un cambio de 0.01 en combined puede mover P en 1 punto exactamente en los 4 límites (0.2, 0.4, 0.6, 0.8). Propiedad conocida de escalas ordinales Likert.

### 2.4 Reutilización de tabla para fuente externa

La probabilidad anual de ocurrencia de un hazard (0-1, GRI Oxford) y la confianza epistémica combinada (SQ×SS) son magnitudes conceptualmente distintas que comparten solo el rango [0,1]. La reutilización de la misma tabla es una simplificación deliberada, NO una equivalencia calibrada. Ver thresholds.json confidence_to_probability._refs._h6_9_external_scale_gap para el vacío de calibración declarado.

---

## 3. Fenómenos con fuente externa vs. solo cálculo interno

| Fenómeno | Fuente externa | Variable canónica | Estado |
|----------|---------------|-------------------|--------|
| sequia | GRI Oxford (hazard_risk_gri) | gri_drought_occurrence | Mapeado, pero Stage 03 no extrae el dato |
| inundacion | GRI Oxford (hazard_risk_gri) | gri_flood_occurrence | Mapeado, pero Stage 03 no extrae el dato |
| ola_de_calor | GRI Oxford (hazard_risk_gri) | gri_extreme_heat_occurrence | Mapeado, pero Stage 03 no extrae el dato |
| ola_de_frio | Sin fuente | — | Solo cálculo interno |
| el_nino | Sin fuente | — | Solo cálculo interno (ENO fase no cubierta por GRI) |
| la_nina | Sin fuente | — | Solo cálculo interno (EN fase no cubierta por GRI) |

---

## 4. Output de calculateProbability()

```javascript
{
  value: number,              // 1-5 Likert
  source: "external" | "calculated",
  external_source: string | null,  // "gri_oxford:gri_drought_occurrence" o null
  justification: string,      // trazabilidad completa con valores numéricos
}
```

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.13 (ALTO): calculateProbability() usaba valor fijo=3 | Ahora consume confidence.combined con tabla configurable |
| H-6.7 (MEDIO): fallback divergía de la tabla | DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING como copia idéntica |
| H-6.9 (ALTO): fuentes externas no consultadas | getExternalProbability() implementado con PHENOMENON_TO_EXTERNAL_PROBABILITY |
| H-6.1 (MEDIO): fórmula atribuida a IPCC | Referencia corregida a ISO 31000:2018 §6.6 |
