# PASO-2 — Capacidad Adaptativa

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateAdaptiveCapacity()`, `getIndicatorValue()` |
| **Ubicación** | `pipeline/stages/06-risk/index.js:220-325` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del cálculo de Capacidad Adaptativa (CA) desde indicadores socioeconómicos normalizados, incluyendo normalización min-max, promedio simple, y manejo de datos faltantes |

---

## 1. Resumen Ejecutivo

calculateAdaptiveCapacity() lee indicadores socioeconómicos desde canonical_variables (output de Stage 03), los normaliza a escala Likert 1-5 usando la configuración min-max de adaptive-capacity.json, calcula un promedio simple (ponderación igual 1/N), y aplica un fallback a CA=3 cuando hay menos de 3 indicadores disponibles para prevenir NaN en la fórmula de riesgo.

---

## 2. Flujo detallado

### 2.1 Lectura de indicadores

```javascript
for (const ind of indicators) {
  const value = this.getIndicatorValue(ind.id, canonicalVariables);
  if (value != null) {
    sum += value;
    used.push(ind.id);
    indicatorDetails.push({ id: ind.id, normalized_score: value });
  }
}
```

**Lógica**: Se itera sobre los 5 indicadores definidos en adaptive-capacity.json. Para cada uno, getIndicatorValue() busca la variable canónica correspondiente (via INDICATOR_TO_CANONICAL) y la normaliza. Si el valor es null (sin dato disponible), se excluye del promedio — null significa "calidad desconocida", no "calidad = 0".

### 2.2 Normalización min-max (getIndicatorValue)

```javascript
const normalized = min_score + ((raw - min_value) / (max_value - min_value)) * (max_score - min_score);
return Math.max(1, Math.min(5, Math.round(normalized)));
```

**Fórmula**: `normalized = min_score + ((raw - min_value) / (max_value - min_value)) × (max_score - min_score)`

**Ejemplo** (poverty_rate): min_value=3%, max_value=52%, min_score=5, max_score=1 (invertido — a mayor pobreza, menor CA). Para Huancavelica (52%): `5 + ((52-3)/(52-3)) × (1-5) = 5 + 1×(-4) = 1`. Para Lima (3%): `5 + ((3-3)/(52-3)) × (1-5) = 5 + 0 = 5`.

**Protección**: Si max_value === min_value (rango degenerado), retorna el punto medio de la escala para evitar división por cero.

### 2.3 Umbral mínimo de indicadores

```javascript
if (used.length < minIndicators) {
  return { score: null, indicators_used: used, ... };
}
```

**Umbral**: `_min_indicators = 3` (ND-GAIN Index, IPCC AR6 Ch.8). Si hay menos de 3 indicadores con datos, CA queda null.

**Trazabilidad**: H-6.2 (CRÍTICO) — antes de H-6.2, getIndicatorValue() siempre retornaba null, haciendo que este umbral SIEMPRE se cumpliera y CA siempre fuera null.

### 2.4 Promedio simple

```javascript
const score = Math.round(sum / used.length);
const weight = 1 / used.length;
```

**Fórmula**: `CA = round(Σ(normalized_scores) / N)` donde N = número de indicadores con datos.

**Ponderación**: 1/N (igual weight) — Principio de máxima entropía / Laplace (Jaynes, 1957). Documentado en adaptive-capacity.json _methodology.weighting como placeholder pendiente de calibración AHP en v3.

**Análisis de sensibilidad** (H-6.16): Para cualquier esquema de pesos no-negativos que sumen 1, el promedio ponderado está acotado en [min(scores), max(scores)] (propiedad de combinaciones convexas). La desviación máxima posible de CA bajo pesos alternativos es el rango de los indicadores contribuyentes, reportado en cada ejecución.

### 2.5 Fallback CA=null → default (3)

```javascript
const caScore = adaptiveCapacity.score ?? thresholds.adaptive_capacity?.default ?? 3;
```

**Propósito**: Previene NaN en la fórmula de riesgo `(P × I) / CA`. Cuando CA=null (datos insuficientes), se usa el default=3 (punto medio de escala 1-5, máxima entropía Jaynes 1957).

**Trazabilidad**: H-6.2 (CRÍTICO), H-6.11 (CRÍTICO).

---

## 3. Indicadores soportados

| ID | Fuente | Código WB/GRI | Inverso | Normalización | Citation |
|----|--------|--------------|---------|---------------|----------|
| poverty_rate | world_bank | SI.POV.NAHC | sí | 3%→5, 52%→1 | IPCC AR6 Ch.8 §8.2.1 |
| gdp_per_capita | world_bank | NY.GDP.PCAP.CD | no | 2000→1, 12000→5 | IPCC AR6 Ch.8 §8.2.1, Brooks et al. 2005 |
| access_to_water | world_bank | SH.H2O.BASW.ZS | no | 55%→1, 98%→5 | ND-GAIN, WHO/UNICEF JMP 2023 |
| healthcare_access | gri_oxford | traveltime_to_healthcare | sí | 0min→5, 120min→1 | Weiss et al. 2020, Nature Medicine |
| education_literacy | world_bank | SE.ADT.LITR.ZS | no | 70%→1, 99%→5 | Brooks et al. 2005, ND-GAIN |

**Notas**:
- "Inverso"=true significa que valores altos del indicador implican CA baja (e.g., pobreza alta → CA baja).
- Los rangos min/max_value están calibrados en P5-P95 de datos subnacionales Peru (INEI ENAHO 2023 / Censo 2017).

---

## 4. Output de calculateAdaptiveCapacity()

```javascript
{
  score: number,                    // CA Likert 1-5 o null
  indicators_used: string[],        // IDs de indicadores con datos
  indicator_details: [{ id, normalized_score }],  // detalle por indicador
  indicators: [{                    // formato contrato (H-6.15)
    name: string,                   // = id del indicador
    value: number,                  // normalized_score
    weight: number | null,          // 1/N o null si CA=null
    contribution: number | null,    // normalized_score × weight o null
  }],
  justification: string,            // trazabilidad completa del cálculo
}
```

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-6.2 (CRÍTICO): getIndicatorValue() siempre retornaba null | Implementado leyendo canonical_variables con INDICATOR_TO_CANONICAL |
| H-6.11 (CRÍTICO): CA=null causaba NaN en risk_score_raw | Fallback caScore = adaptiveCapacity.score ?? default ?? 3 |
| H-6.15 (MEDIO): output no cumplía contrato | indicators[] con {name, value, weight, contribution} agregado |
| H-6.16 (BAJO): promedio simple sin análisis | Sensibilidad documentada: desviación max = rango de indicadores |
| H-6.18 (BAJO): sector no propagado | physical_sensitivity y sensitivity_scaled en impact.components |
