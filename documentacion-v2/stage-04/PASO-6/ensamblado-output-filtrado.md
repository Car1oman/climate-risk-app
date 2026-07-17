# PASO-6 — Ensamblado de Output e Filtragem

**Documento de Arquitectura, Trazabilidad e Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `assembleOutput()`, `filterByMinSignalStrength()`, `summarizeSourceQuality()` |
| **Ubicación** | `pipeline/stages/04-signals/index.js:193-268`, `index.js:302-348` |
| **Stage** | Stage 04 — Signals (ID: 4) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del ensamblado del output final, filtrado por signal strength mínimo y resumen de source quality |

---

## 1. Resumen Ejecutivo

PASO-6 ensambla el output final de Stage 04: filtra señales por `min_signal_strength`, agrega `signals_discarded` con razones explícitas, y genera `source_quality_summary` con distribución y componentes excluidos. El output cumple estrictamente `Stage04OutputSchema` (Types.js) — un objeto `{signals, signals_discarded, source_quality_summary}`.

---

## 2. Flujo de Ensamblado

```
execute(input)                                                   // index.js:22
  │
  ├── Para cada sourceInput en input.sources:
  │   ├── Para cada canonical_variable:
  │   │   ├── classifySignal(v)                                  // ← PASO 4
  │   │   ├── calculateSourceQuality(source, sector)             // ← PASO 2
  │   │   ├── calculateSignalStrength(v, allVariables)           // ← PASO 3
  │   │   ├── detectTransitionRisk(v, sector, source)            // ← PASO 5
  │   │   └── ensamblar signalOutput
  │   │
  │   └── signalOutputs.push(signalOutput)
  │
  ├── Filtrar por min_signal_strength                            // ← PASO 6.1
  │   ├── señales >= min → conservadas
  │   └── señales < min → a signals_discarded
  │
  ├── Generar source_quality_summary                             // ← PASO 6.2
  │   ├── distribution (promedio, mínimo, máximo, count)
  │   ├── por_variable (scores individuales)
  │   └── components_excluded (componentes no calculados)
  │
  └── Retornar {signals, signals_discarded, source_quality_summary}
```

---

## 3. Filtrado por Signal Strength (6.1)

### 3.1 Criterio de Filtrado

```javascript
// index.js:302-322
const minSS = getThresholds().signal_activation.min_signal_strength;  // 0.40
const signals = [];
const discarded = [];

for (const sig of rawSignals) {
  const ss = sig.signal_strength?.score;
  if (ss == null || ss < minSS) {
    discarded.push({
      ...sig,
      discard_reason: ss == null ? "no_signal_strength" : "below_min_signal_strength",
      discarded_at: new Date().toISOString()
    });
  } else {
    signals.push(sig);
  }
}
```

### 3.2 Razones de Descarte

| Razón | Condición | Descripción |
|-------|-----------|-------------|
| `below_min_signal_strength` | `score < min_signal_strength` (0.40) | Señal débil, no supera umbral mínimo |
| `no_signal_strength` | `score == null` | Sin metodología de signal strength aplicable |

### 3.3 H-13: signals_discarded

**Hallazgo**: signals_discarded no existía — señales débiles se descartaban silenciosamente.

**Resolución**: Array `signals_discarded` con la señal descartada + razón + timestamp. Permite auditoría completa de qué se descartó y por qué.

---

## 4. source_quality_summary (6.2)

### 4.1 Estructura

```javascript
{
  distribution: {
    avg: number,          // Promedio de source_quality
    min: number,          // Mínimo
    max: number,          // Máximo
    count: number         // Cantidad de señales con source_quality válida
  },
  by_variable: {
    [variable_name]: number  // Score de source_quality por variable
  },
  components_excluded: [
    {
      component: string,    // Nombre del componente excluido
      reason: string,       // Razón de la exclusión
      variable: string      // Variable donde ocurrió
    }
  ]
}
```

### 4.2 Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `distribution.avg` | number | Promedio de source_quality entre todas las señales |
| `distribution.min` | number | Mínimo de source_quality |
| `distribution.max` | number | Máximo de source_quality |
| `distribution.count` | number | Cantidad de señales con source_quality válida |
| `by_variable` | object | Mapa variable → score de source_quality |
| `components_excluded` | array | Componentes de SQ excluidos (con razón) |

### 4.3 H-06: source_quality_summary

**Hallazgo**: summary no incluía componentes excluidos ni distribución detallada.

**Resolución**: Ahora incluye `distribution` (avg/min/max/count), `by_variable` (score por variable), y `components_excluded` (razones de exclusión de componentes de SQ).

---

## 5. Output Final (Stage04OutputSchema)

### 5.1 Estructura

```javascript
{
  signals: [
    {
      // Input
      source: string,
      variable: string,
      canonical_variable: string,
      sector: string,
      spatial_distance_km: number|null,

      // Config
      signal_name: string,
      signal_type: string,

      // Source Quality
      source_quality: {
        score: number,
        components: {
          coverage_spatial: number,
          coverage_temporal: number,
          completeness: number,
          resolution: number,
          proximity: number
        },
        components_excluded: [
          { component: string, reason: string }
        ],
        methodology: string
      },

      // Signal Strength
      signal_strength: {
        score: number,
        label: string,
        components: object,
        anomaly_value: number|null
      },

      // Classification
      methodology_completeness_ratio: number,

      // Transition Risk (opcional)
      transition_risks: [
        {
          type: string,
          description: string,
          risk_level: string,
          risk_score: number,
          timeframe: string
        }
      ]
    }
  ],

  signals_discarded: [
    {
      // ...misma estructura que signal + discard_reason, discarded_at
    }
  ],

  source_quality_summary: {
    distribution: { avg, min, max, count },
    by_variable: { [variable]: score },
    components_excluded: [{ component, reason, variable }]
  }
}
```

---

## 6. Trazabilidad

| Referencia | Hallazgo | Resolución |
|------------|----------|------------|
| H-04 (CRÍTICO) | Output no tenía signals_discarded | signals_discarded con razón y timestamp |
| H-06 (ALTO) | source_quality_summary no tenía componentes excluidos | components_excluded + distribution + by_variable |
| H-13 (MEDIO) | Señales débiles descartadas silenciosamente | signals_discarded explícito con razones |
| H-15 (BAJO) | Hardcoded stageName | Variable `stageName = 'stage-04-signals'` |
| H-16 (BAJO) | Output no alineado con schema | Output cumple estrictamente Stage04OutputSchema |
