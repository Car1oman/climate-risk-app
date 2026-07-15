# Stage 04 — Signals

**Stage ID**: 4 | **Name**: Signal Derivation

## Input Contract

```typescript
{
  stage_03_output: { canonical_variables: CanonicalVariable[] },
  config: {
    source_quality_weights: {
      coverage_spatial: number,
      coverage_temporal: number,
      completeness: number,
      resolution: number,
      proximity: number
    },
    signal_thresholds: {
      min_signal_strength: number,
      anomaly_delta_temp: number,
      anomaly_delta_precip_pct: number,
      enso_oni_threshold: number
    }
  }
}
```

## Output Contract

```typescript
{
  stage: "signals",
  status: "success",
  signals: ClimateSignal[],
  signals_discarded: { name: string, strength: number, reason: string }[],
  source_quality_summary: {
    overall: number,
    by_source: Record<string, number>
  }
}
```

## Behavior

1. Para cada variable canónica con datos disponibles, aplicar detectores de señal:
   - **AnomalyDetector**: compara valor actual vs histórico (misma estación)
   - **TrendDetector**: evalúa dirección y persistencia
   - **CategoricalDetector**: para estados discretos (ENSO neutral/El Niño/La Niña)
   - **ProjectionDetector**: evalúa Δ entre histórico y proyección futura
2. Calcular `source_quality` (0-1) como promedio ponderado de 5 componentes.
3. Calcular `signal_strength` (0-1) según tipo de detector.
4. Descartar señales con `signal_strength < min_signal_strength`.

## Rules Applied

1. Source Quality = Σ(component_i × weight_i) / Σ(weights)
2. Pesos de source_quality son configurables y versionados.
3. Signal Strength es específica del tipo de detector (no hay fórmula universal).
4. Señales descartadas se conservan en `signals_discarded` con razón.

## Signal Detectors

| Detector | Input | Signal Strength Factors |
|----------|-------|------------------------|
| AnomalyDetector | valor actual + serie histórica | magnitud anomalía, persistencia temporal |
| TrendDetector | serie temporal multi-observación | dirección consistente, pendiente |
| CategoricalDetector | estado categórico | confianza de la fuente, transición reciente |
| ProjectionDetector | histórico + proyección | Δ absoluto, consistencia entre modelos |

## Traceability

- Cada señal tiene sus componentes de source_quality y signal_strength
  con los pesos aplicados.
- Señales descartadas se registran con su strength y la regla que las excluyó.
