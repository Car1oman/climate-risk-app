# Stage 04 — Signals

## Propósito

Generar señales climáticas con confianza bidimensional (source quality × signal strength) desde las variables canónicas normalizadas por Stage 03. Cada señal se clasifica por tipo (anomaly, projected, categorical, static), se evalúa su fortaleza usando el detector específico al tipo de variable, se filtra por umbral mínimo de activación, y se entregan tanto las señales válidas como las descartadas con su razón.

## Arquitectura del stage

```
index.js (Stage04Signals)
│
├─ execute()
│   ├─ PASO 1: Carga de configuración          → thresholds, taxonomy, decorrelation,
│   │                                                resolution, temporal, weights
│   ├─ PASO 2: Por cada variable canónica:
│   │   ├─ PASO 4: classifySignal(v)           → signalName, signalType (taxonomy)
│   │   ├─ PASO 2: calculateSourceQuality()    → score, 5 componentes, weights
│   │   │   ├─ computeCoverageSpatial()         → exp(-d/L) o non_stochastic rules
│   │   │   ├─ computeCoverageTemporal()        → point_in_time / climate_normal / horizon_ratio
│   │   │   ├─ computeCompleteness()            → methodology_completeness_ratio (Stage 3)
│   │   │   ├─ computeResolution()              → exp(-α × max(0, ratio-1))
│   │   │   └─ computeProximity()               → max(0, 1 - d/max_km)
│   │   ├─ PASO 3: calculateSignalStrength()   → score, label, 4 componentes, anomaly_value
│   │   │   ├─ computeProjectionDetector()      → projected_change, cross_period_consistency
│   │   │   ├─ computeAnomalyDetector()         → anomaly_magnitude
│   │   │   ├─ computeCategoricalDetector()     → anomaly_magnitude (binario)
│   │   │   └─ computeSignificanceRatio()       → Δ normalizado contra umbral thresholds.json
│   │   └─ PASO 5: Filtro y clasificación      → signals[] o signalsDiscarded[]
│   └─ PASO 6: Ensamblar output               → { signals, signals_discarded, source_quality_summary }
│
├─ Confidence functions (confidence.js)
│   ├─ calculateSourceQuality(source, sector)  → Score 0-1, 5 componentes
│   └─ calculateSignalStrength(variable, all)  → Score 0-1, label, detector type
│
├─ Detectors (detectors/)
│   └─ transition-risk-detector.js             → Riesgos de transición por perfil sectorial
│
├─ Config files (pipeline/config/):
│   ├─ thresholds.json               ← source_quality_weights, signal_activation, anomaly thresholds
│   ├─ signal-taxonomy.json          ← mapeo declarativo variable → {signal_name, signal_type}
│   ├─ spatial-decorrelation.json    ← decorrelation_length_km por variable
│   ├─ temporal-coverage-profiles.json ← metodología coverage_temporal por tipo de fuente
│   ├─ resolution-profiles.json      ← required_resolution_m por sector, decay_alpha
│   ├─ validation-profiles.json      ← physical_ranges para significancia de anomalía
│   └─ sector-profiles.json          ← transition_risks, transition_sensitivity por sector
│
└─ Shared modules (pipeline/shared/):
    ├─ resolution-parser.js          ← parseResolutionToMeters (string → metros)
    └─ horizons.js                   ← Bandas de horizonte (historico/corto/mediano/largo)
```

## Dependencias de entrada

| Origen | Campo | Descripción |
|--------|-------|-------------|
| Stage 03 | `canonical_variables[]` | Variables normalizadas con valor, unidad, fuente, spatial_info, methodology |
| Stage 03 | `canonical_variables[].methodology.completeness_ratio` | Completitud temporal real (WMO No.100 / GCOS-245) |
| Stage 03 | `canonical_variables[].data_time_range` | Ventana temporal cubierta por la fuente |
| Stage 03 | `canonical_variables[].spatial_info.distance_km` | Distancia al punto de datos más cercano |
| Stage 03 | `canonical_variables[].spatial_info.resolution` | Resolución nativa de la fuente |
| Config | `thresholds.json` | source_quality_weights, signal_activation, anomaly thresholds |
| Config | `signal-taxonomy.json` | Mapeo variable→{signal_name, signal_type} |
| Config | `spatial-decorrelation.json` | decorrelation_length_km por variable, non_stochastic rules |
| Config | `temporal-coverage-profiles.json` | Metodología coverage_temporal por tipo de fuente |
| Config | `resolution-profiles.json` | required_resolution_m por sector, decay_alpha |
| Config | `validation-profiles.json` | physical_ranges para computeSignificanceRatio |
| Config | `sector-profiles.json` | transition_risks, transition_sensitivity por sector |
| Shared | `resolution-parser.js` | Conversión resolution_native string → metros |
| Shared | `horizons.js` | Bandas de horizonte CMIP6 (nominal_start/end) |

## Output

El stage produce un objeto con esta estructura:

```javascript
{
  stage: "signals",
  status: "success",
  signals: [/* ClimateSignal[] — señales que pasaron el filtro */],
  signals_discarded: [
    {
      name: string,           // signal_name de la señal descartada
      strength: number|null,  // signal_strength.score (null si no calculable)
      reason: string          // Razón explícita del descarte
    }
  ],
  source_quality_summary: {
    overall: number|null,           // Promedio de todos los scores evaluables
    by_source: Record<string, number> // Promedio por adapter (source_name)
  }
}
```

## Resumen de los 6 pasos

| Paso | Nombre | Responsabilidad clave |
|------|--------|----------------------|
| 1 | Carga de configuración | Cachear thresholds, taxonomy, decorrelation, resolution, temporal, weights |
| 2 | Source Quality (confidence.js) | Calcular 5 componentes de calidad de fuente con pesos configurables |
| 3 | Signal Strength (confidence.js) | Calcular fortaleza de señal por detector específico al tipo de variable |
| 4 | Clasificación de señal (taxonomy) | Mapear variable canónica → signal_name + signal_type desde config declarativa |
| 5 | Detección de riesgos de transición | Evaluar riesgos sectoriales (regulatorio, mercado, tecnología, reputacional) |
| 6 | Ensamblar output | Filtrar por min_signal_strength, generar signals_discarded, source_quality_summary |

## Confianza Bidimensional

Stage 4 reporta DOS dimensiones de confianza separadas, nunca colapsadas:

| Dimensión | Mide | Componentes | Fundamento |
|-----------|------|-------------|------------|
| **Source Quality** | Calidad de la fuente de datos | coverage_spatial (30%), coverage_temporal (20%), completeness (20%), resolution (20%), proximity (10%) | OECD/JRC 2008, WMO, CEOS WGCV, Isaaks & Srivastava 1989 |
| **Signal Strength** | Fortaleza de la señal climática detectada | anomaly_magnitude, temporal_persistence, cross_period_consistency, projected_change (varía por detector) | IPCC AR6, UNFCCC, ETCCDI, Trenberth 1997 |

La combinación de ambas dimensiones se realiza en Stage 05 (media geométrica, ver `thresholds.json signal_activation.confidence_combination`).

## Detectors por tipo de variable

| Detector | Tipo de señal | Variables aplicables | Componentes calculables |
|----------|--------------|---------------------|------------------------|
| AnomalyDetector | `anomaly` | air_temperature_current (weatherapi), precipitation_sum (nasa_power) | anomaly_magnitude (vs baseline climatológica) |
| ProjectionDetector | `projected` | air_temperature_max/min, precipitation_sum (openmeteo_cmip6, con horizonte) | projected_change (Δ vs histórico), cross_period_consistency (acuerdo de signo entre bandas) |
| CategoricalDetector | `categorical` | enso_phase | anomaly_magnitude (1.0 si activo, 0.0 si neutral) |
| baseline_or_static | `static` | elevation, cc_*, *_historico, indicadores socioeconómicos, gri_* | Ninguno (es la referencia contra la que otras variables se comparan) |
| unclassified | (cualquiera) | Variables sin línea base pareada (relative_humidity, wind_speed, etc.) | Ninguno (sin metodología aplicable) |

## Auditorías

Ver `AUDITORIA-stage-04-signals.md` para hallazgos de calidad y su resolución.
