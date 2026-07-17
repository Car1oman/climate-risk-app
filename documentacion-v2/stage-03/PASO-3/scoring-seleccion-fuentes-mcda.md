# PASO-3 — Scoring y Selección de Fuentes (MCDA)

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `_scoreSources()`, `_applyAuthorityGate()`, `_computeSensitivity()`, `_compareScored()` |
| **Ubicación** | `pipeline/stages/03-normalization/index.js` (líneas 215-343, 1136-1172) |
| **Stage** | Stage 03 — Normalization (ID: 3) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del tercer paso de Stage 03: scoring multi-dimensión y selección de la mejor fuente por dominio |

---

## 1. Resumen Ejecutivo

PASO-3 implementa un sistema de decisión multicriterio (MCDA) para seleccionar la mejor fuente de datos por dominio climático. El scoring evalúa tres dimensiones con pesos iguales (equal-weight):

1. **Completeness** (completitud): Proporción de valores válidos en la serie temporal
2. **Proximity** (proximidad): Decaimiento exponencial de la distancia espacial
3. **Resolution** (resolución): Normalización TOPSIS-style (ranking min-max relativo)

La selección sigue un proceso de dos etapas:
1. **Scoring equal-weight**: Promedio de las 3 dimensiones activas (o 2 si resolución no discrimina)
2. **Authority gate**: Fuente primaria con completeness ≥ 0.80 se selecciona directamente, salvo que una complementary domine en TODAS las dimensiones

**Pre-condición**: PASO-2 debe haber agrupado fuentes por dominio.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
for (const [domain, domainSources] of Object.entries(byDomain)) {
  const scored = this._scoreSources(domainSources, validationMap, domain);  // ← PASO 3
  const bestSource = scored[0];
  // ...
}
```

### 2.2 Flujo de datos

```
domainSources[] (PASO 2 output)
  │
  ├── [raw scoring]
  │     ├── completeness = validation.summary.completeness_pct
  │     ├── proximity = exp(-distance / decorrelation_length_km)
  │     └── resolution_m = _parseResolutionToMeters(resolution_native)
  │
  ├── [dimension activation check]
  │     └── resolutionActive = (≥2 sources have resolution AND not all identical)
  │
  ├── [score computation]
  │     ├── dims = [completeness, proximity]
  │     ├── IF resolutionActive: dims.push(resolution_score)
  │     └── totalScore = sum(dims) / dims.length
  │
  ├── [sorting]
  │     └── scored.sort(_compareScored)  →  [primary, complementary1, complementary2, ...]
  │
  └── [_applyAuthorityGate]
        ├── primary completeness ≥ 0.80? → GATE FIRES → [primary, ...rest]
        └── complementary dominates ALL dimensions? → gate skipped → scored (pre-existing order)
```

---

## 3. Descripción Detallada del Flujo

### 3.1 `_scoreSources()` (index.js:215-272)

```javascript
_scoreSources(sources, validationMap, domain) {
  const decorrCfg = this._decorrelationConfig;

  const raw = sources.map(source => {
    const validation = validationMap.get(source.source_name);
    const completeness = validation?.summary?.completeness_pct ?? 0.5;

    const distance = source.spatial_distance_km;
    const decorrL = this._getDecorrelationLengthForDomain(domain, decorrCfg);
    const proximityScore =
      distance != null && decorrL != null && decorrL > 0
        ? Math.exp(-distance / decorrL)
        : 1.0;

    return { source, completeness, proximity: proximityScore, resolution_m: this._parseResolutionToMeters(source.resolution_native) };
  });

  const resolutionValues = raw.map(r => r.resolution_m).filter(v => v != null);
  const resolutionActive = resolutionValues.length >= 2 && Math.max(...resolutionValues) > Math.min(...resolutionValues);
  const resMin = resolutionActive ? Math.min(...resolutionValues) : null;
  const resMax = resolutionActive ? Math.max(...resolutionValues) : null;

  const scored = raw.map(r => {
    const dims = [r.completeness, r.proximity];
    let resolutionScore = null;
    if (resolutionActive) {
      resolutionScore = r.resolution_m != null ? (resMax - r.resolution_m) / (resMax - resMin) : 0.5;
      dims.push(resolutionScore);
    }
    const totalScore = dims.reduce((a, b) => a + b, 0) / dims.length;

    return {
      source: r.source,
      score: Math.round(totalScore * 10000) / 10000,
      components: {
        completeness: r.completeness,
        proximity: r.proximity,
        resolution_m: r.resolution_m,
        resolution_score: resolutionScore,
      },
    };
  });

  scored.sort((a, b) => this._compareScored(a, b));
  return this._applyAuthorityGate(scored);
}
```

### 3.2 Dimensiones de scoring

#### 3.2.1 Completeness (completitud)

```javascript
const completeness = validation?.summary?.completeness_pct ?? 0.5;
```

**Fuente**: `validation.summary.completeness_pct` (calculado en Stage 02)

**Rango**: [0, 1] — 1.0 = serie completa, 0.5 = 50% de valores válidos

**Fallback**: 0.5 si no hay información de validación (neutral)

**Referencia**: GCOS-245 (Carro-Calvo et al. 2020), WMO No. 100

#### 3.2.2 Proximity (proximidad espacial)

```javascript
const proximityScore =
  distance != null && decorrL != null && decorrL > 0
    ? Math.exp(-distance / decorrL)
    : 1.0;
```

**Fórmula**: `score = exp(-distance / decorrelation_length_km)`

**Parámetros**:
- `distance`: Distancia euclidiana desde el punto de interés hasta la fuente (km)
- `decorrelation_length_km`: Distancia a la cual la correlación cae a 1/e (configurable por variable en `spatial-decorrelation.json`)

**Rango**: (0, 1] — 1.0 = co-locada, ~0.37 a 1 decorrelation length, ~0.14 a 2 decorrelation lengths

**Fallback**: 1.0 si no hay distancia o configuración de decorrelación (asume co-localización)

**Referencia**: Modelo exponencial de decorrelación espacial (Cressie, 1993)

#### 3.2.3 Resolution (resolución, normalización TOPSIS-style)

```javascript
resolutionScore = r.resolution_m != null ? (resMax - r.resolution_m) / (resMax - resMin) : 0.5;
```

**Fórmula**: `score = (resMax - res_m) / (resMax - resMin)` (ranking min-max relativo)

**Condición de activación**: Solo cuando ≥2 fuentes tienen resolución distinta y discriminante

**Rango**: [0, 1] — 1.0 = resolución más fina, 0.0 = resolución más gruesa

**Fallback**: 0.5 si la fuente no reporta resolución (neutral, no penaliza por metadata faltante)

**Referencia**: TOPSIS (Hwang & Yoon, 1981) — normalización por ranking relativo, no por constante absoluta

**Nota metodológica**: La resolución se normaliza por ranking relativo entre las fuentes candidatas de este dominio, no por una constante de decaimiento física absoluta como proximity. Esto es una decisión deliberada: no existe una relación física conocida entre resolución y utilidad que sea universalmente válida para todas las variables climáticas.

### 3.3 Activación condicional de resolución (index.js:239-242)

```javascript
const resolutionValues = raw.map(r => r.resolution_m).filter(v => v != null);
const resolutionActive = resolutionValues.length >= 2 && Math.max(...resolutionValues) > Math.min(...resolutionValues);
```

**Criterios**:
1. Al menos 2 fuentes deben tener resolución parseada
2. Las resoluciones no pueden ser todas idénticas

**Razón**: Si solo 1 fuente tiene resolución o todas son iguales, la dimensión no discrimina → se excluye del scoring para no fabricar un score sin información.

### 3.4 `_compareScored()` (index.js:283-294)

```javascript
_compareScored(a, b) {
  if (b.score !== a.score) return b.score - a.score;

  const resScoreA = a.components.resolution_score;
  const resScoreB = b.components.resolution_score;
  if (resScoreA != null && resScoreB != null && resScoreA !== resScoreB) return resScoreB - resScoreA;

  if (a.source.authority_level !== b.source.authority_level) {
    return a.source.authority_level === "primary" ? -1 : 1;
  }
  return a.source.source_name.localeCompare(b.source.source_name);
}
```

**Criterios de desempate** (en orden):
1. Score total (mayor = mejor)
2. Resolution score (mayor = mejor, solo si ambos tienen)
3. Authority level (primary > complementary)
4. Source name (alfabético, para determinismo)

### 3.5 `_applyAuthorityGate()` (index.js:306-343)

```javascript
_applyAuthorityGate(scored) {
  const primaryEntries = scored.filter(s => s.source.authority_level === "primary");
  if (primaryEntries.length === 0) return scored;

  const primary = primaryEntries.reduce((a, b) =>
    b.components.completeness > a.components.completeness ? b : a
  );

  if (primary.components.completeness < COMPLETENESS_THRESHOLD_DEFAULT) {
    primary.gate_skipped_reason = `completeness=${primary.components.completeness.toFixed(3)} < authority_gate_threshold=${COMPLETENESS_THRESHOLD_DEFAULT}`;
    return scored;
  }

  const resolutionActive = primary.components.resolution_score != null;

  const dominatingComplementary = scored.find(s => {
    if (s === primary) return false;
    const beatsCompleteness = s.components.completeness > primary.components.completeness;
    const beatsProximity = s.components.proximity > primary.components.proximity;
    const beatsResolution = !resolutionActive || s.components.resolution_score > primary.components.resolution_score;
    return beatsCompleteness && beatsProximity && beatsResolution;
  });
  if (dominatingComplementary) {
    primary.gate_skipped_reason = `dominated by complementary source ${dominatingComplementary.source.source_name}`;
    return scored;
  }

  primary.gated = true;
  primary.gate_reason = `authority_gate: primary completeness=${primary.components.completeness.toFixed(3)} >= ${COMPLETENESS_THRESHOLD_DEFAULT}`;
  return [primary, ...scored.filter(s => s !== primary)];
}
```

**Lógica del gate**:
1. **Condición de activación**: Fuente primaria con completeness ≥ 0.80
2. **Excepción**: Si una complementary DOMINA en TODAS las dimensiones activas (completeness, proximity, resolution cuando está activa), el gate NO se activa y la complementary se selecciona por scoring
3. **Razón**: La autoridad es un criterio para preferir primaria cuando la evidencia es comparable, NO para seleccionar primaria sobre una complementary estrictamente mejor

### 3.6 `_computeSensitivity()` (index.js:1136-1172)

```javascript
_computeSensitivity(scored) {
  if (scored.length < 2) {
    return { applicable: false, reason: "single_candidate_no_comparison_needed" };
  }

  const resolutionActive = scored.every(s => s.components.resolution_score != null);
  const dimensions = resolutionActive
    ? ["completeness", "proximity", "resolution_score"]
    : ["completeness", "proximity"];

  const vertices = dimensions.map(dim => {
    const ranked = [...scored].sort((a, b) => {
      const diff = b.components[dim] - a.components[dim];
      if (diff !== 0) return diff;
      return this._compareScored(a, b);
    });
    return {
      dimension: dim,
      winner: ranked[0].source.source_name,
      value: ranked[0].components[dim],
    };
  });

  const distinctWinners = new Set(vertices.map(v => v.winner));
  const winnerStable = distinctWinners.size === 1;

  return {
    applicable: true,
    dimensions_used: dimensions,
    weight_scheme: `equal (1/${dimensions.length} each)`,
    vertices,
    winner_stable: winnerStable,
    interpretation: winnerStable
      ? `El mismo candidato (${vertices[0].winner}) gana bajo CUALQUIER ponderación posible`
      : `La selección SÍ depende de la ponderación elegida: ${vertices.map(v => `${v.dimension}→${v.winner}`).join(", ")}`,
  };
}
```

**Análisis de sensibilidad**: Prueba matemática por vértices del simplex de pesos

**Interpretación**:
- `winner_stable: true` → El mismo candidato gana bajo CUALQUIER ponderación posible (invariante a pesos)
- `winner_stable: false` → La selección depende de la ponderación (tratar con escrutinio adicional)

**Referencia**: Análisis de sensibilidad por vértices (no muestreo de combinaciones)

---

## 4. Ejemplo Numérico

### 4.1 Escenario: Dominio `precipitation` con 3 fuentes

| Fuente | Authority | Completeness | Distance (km) | Resolution |
|--------|-----------|--------------|---------------|------------|
| senamhi_daily | primary | 0.85 | 50 | 0.25° |
| chirps_daily | complementary | 0.92 | 200 | 0.05° |
| era5_land_daily | complementary | 0.98 | 500 | 0.1° |

**Configuración**:
- `decorrelation_length_km.precipitation` = 50 km
- `COMPLETENESS_THRESHOLD_DEFAULT` = 0.75

**Scoring**:

| Fuente | Completeness | Proximity | Resolution_score | Total |
|--------|-------------|-----------|-----------------|-------|
| senamhi_daily | 0.85 | exp(-50/50) = 0.368 | (0.25° - 0.05°)/(0.25° - 0.05°) = 1.0 | (0.85+0.368+1.0)/3 = 0.739 |
| chirps_daily | 0.92 | exp(-200/50) = 0.018 | (0.25° - 0.05°)/(0.25° - 0.05°) = 1.0 | (0.92+0.018+1.0)/3 = 0.646 |
| era5_land_daily | 0.98 | exp(-500/50) = 0.000045 | (0.25° - 0.1°)/(0.25° - 0.05°) = 0.75 | (0.98+0.000045+0.75)/3 = 0.577 |

**Nota**: Los valores de resolution_score son ejemplos simplificados. En la práctica, la normalización TOPSIS se calcula entre las fuentes candidatas de este dominio.

### 4.2 Authority gate

- `senamhi_daily` (primary) tiene completeness = 0.85 ≥ 0.80 → **gate activado**
- ¿Alguna complementary domina en TODAS las dimensiones?
  - `chirps_daily`: completeness 0.92 > 0.85 ✓, proximity 0.018 < 0.368 ✗ → NO domina
  - `era5_land_daily`: completeness 0.98 > 0.85 ✓, proximity 0.000045 < 0.368 ✗ → NO domina
- **Resultado**: `senamhi_daily` se selecciona por authority gate

---

## 5. Tabla de Impacto

| Componente | Tipo de cambio | Riesgo si falla | Dependencia |
|------------|---------------|-----------------|-------------|
| `_scoreSources()` | Core scoring | Selección incorrecta de fuente | `validationMap`, `decorrCfg` |
| `_applyAuthorityGate()` | Selección | Primaria de baja calidad seleccionada | `_scoreSources()` |
| `_computeSensitivity()` | Análisis | Sensibilidad no reportada | `_scoreSources()` |
| `_compareScored()` | Orden | Resultado no determinista | `score`, `resolution_score` |
| `_parseResolutionToMeters()` | Conversión | Resolución mal interpretada | `resolution_native` |
| `_getDecorrelationLengthForDomain()` | Config lookup | Proximity = 1.0 (sin decaimiento) | `spatial-decorrelation.json` |

---

## 6. Supuestos y Limitaciones

1. **Pesos iguales (1/3 por dimensión)**: No hay evidencia para preferir un peso sobre otro. La sensibilidad por vértices verifica si la elección es invariante.

2. **Recencia y metodología excluidas del scoring**: No hay campo estandarizado de recencia entre adaptadores en esta etapa (gap rastreado, no omisión). Metodología se asigna DESPUÉS de seleccionar la fuente (circular como input).

3. **Authority level no es dimensión de scoring**: Solo actúa como criterio de desempate y en el authority gate. La asimetría de fórmula (primary con mejor fórmula que complementary) se eliminó explícitamente.

4. **Resolution solo se activa cuando discrimina**: Si solo 1 fuente tiene resolución o todas son iguales, la dimensión se excluye del scoring.

5. **Authority gate tiene excepción de dominación**: Si una complementary es estrictamente mejor en TODAS las dimensiones activas, el gate NO se activa — la complementary se selecciona por scoring.

---

## 7. Trazabilidad

| Referencia | Ubicación |
|------------|-----------|
| H-4.1 (Ponderación 50/50) | Auditoría Stage 03, hallazgo 4.1 — RESUELTO: 3 dimensiones + sensitivity analysis |
| H-4.2 (Authority gate ficticio) | Auditoría Stage 03, hallazgo 4.2 — RESUELTO: gate explícito con excepción de dominación |
| H-4.3 (Recencia/metodología excluidas) | Auditoría Stage 03, hallazgo 4.3 — gap rastreado, no omisión |
| H-4.4 (Asimetría de fórmula) | Auditoría Stage 03, hallazgo 4.4 — RESUELTO: equal-weight para todas las fuentes |
| TOPSIS | Hwang & Yoon, 1981 — Multi-Criteria Decision Making |
| Decorrelación espacial | Cressie, 1993 — Statistics for Spatial Data |
