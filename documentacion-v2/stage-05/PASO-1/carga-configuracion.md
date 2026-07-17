# PASO-1 — Carga de Configuración

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `getPhenomenonDefinitions()`, `getThresholds()` |
| **Ubicación** | `pipeline/orchestration/config-loader.js`, consumidas por `pipeline/stages/05-phenomena/index.js` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la carga de configuración que sustenta la definición de fenómenos, umbrales de activación, métodos de agregación y combinación de confianza |

---

## 1. Resumen Ejecutivo

PASO-1 carga y cachea dos archivos de configuración que definen: (1) qué fenómenos existen, qué señales los componen, y qué relación tienen con la evidencia científica (`phenomenon-definitions.json`); y (2) umbrales de activación, métodos de combinación de confianza, y pesos de agregación (`thresholds.json`). El cache de `config-loader.js` (TTL 60s) evita I/O redundante.

**Pre-condición obligatoria**: Sin configuración válida, Stage 05 no puede determinar qué fenómenos evaluar ni cómo combinar la confianza.

---

## 2. Contexto dentro de la Arquitectura

### 2.1 Ubicación en el pipeline

```
PipelineEngine.run(input)                                              // engine.js
  │
  └── Stage05Phenomena.execute(input)                                  // index.js:78
        │
        ├── PASO 1: Validación de entrada                              // validateSignal()
        ├── PASO 2: Carga de configuración
        │   ├── getPhenomenonDefinitions()                             // ← phenomenon-definitions.json
        │   └── getThresholds()                                        // ← thresholds.json
        │
        ├── PASO 3: Por cada definición de fenómeno:
        │   ├── Coincidencia de señales (required + optional)
        │   ├── aggregateSignals()                                     // ← PASO 3b
        │   └── combineConfidence()                                    // ← PASO 3c
        │
        ├── PASO 4: inferStatus(), inferHorizon(), inferScenario()     // ← signal-metadata.js
        ├── PASO 5: Activación (categórica / direccional / numérica)
        └── PASO 6: Ensamblar output → phenomena[], phenomena_not_detected[]
```

### 2.2 Flujo de datos

```
config/ (disco)
  │
  ├── phenomenon-definitions.json ──→ phenomena[] (definiciones de fenómenos)
  │   ├── required_signals[]         ├── name, sign, matchValue, allowedValues
  │   ├── optional_signals[]         ├── min_confidence (o null → hereda global)
  │   ├── scientific_reference       └── notes (por qué cada señal sí/no)
  │   └── excluded_phenomena[]       → fenómenos sin señales viables (documentados)
  │
  └── thresholds.json ──────────────→ signal_activation
      ├── min_source_quality (0.30)    ├── min_phenomenon_activation (0.40)
      ├── min_signal_strength (0.40)   ├── confidence_combination (geometric_mean)
      ├── confidence_weights           ├── signal_aggregation (arithmetic_mean)
      ├── signal_aggregation_weights   └── type_weights (anomaly=1.0, categorical=0.8, projected=0.5)
```

---

## 3. Archivos de Configuración

### 3.1 `phenomenon-definitions.json`

**Responsabilidad**: Definición declarativa de fenómenos climáticos con justificación científica explícita.

**Estructura**:
```json
{
  "_version": "1.0.0",
  "_methodology": { ... },
  "phenomena": [
    {
      "name": "ola_de_calor",
      "required_signals": ["temperatura_actual_anomaly", "temperatura_max_projection", ...],
      "optional_signals": [],
      "sign": "positive",
      "matchValue": null,
      "allowedValues": null,
      "min_confidence": null,
      "scientific_reference": "IPCC AR6 WGI (2021) Ch.11 ...",
      "notes": "temperatura_actual_anomaly cubre la observación presente ..."
    }
  ],
  "excluded_phenomena": [
    {
      "name": "vientos_fuertes",
      "reason": "wind_anomaly siempre se descarta en Stage 04 ...",
      "evidence": "pipeline/stages/04-signals/confidence.js ...",
      "revisit_when": "Stage 04 agregue cc_wind ..."
    }
  ]
}
```

**Campos por fenómeno**:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | PhenomenonNameEnum | Nombre canónico del fenómeno |
| `required_signals` | string[] | Señales que deben estar presentes para considerar el fenómeno (Rule 1) |
| `optional_signals` | string[] | Señales que refuerzan la confianza pero no activan solas |
| `sign` | "positive" \| "negative" \| null | Dirección física del fenómeno (para activación direccional) |
| `matchValue` | string \| null | Valor de coincidencia exacta (para activación categórica) |
| `allowedValues` | string[] \| null | Valores permitidos para la señal categórica (validación defensiva) |
| `min_confidence` | number \| null | SQ mínimo para este fenómeno (null = hereda global 0.30) |
| `scientific_reference` | string | Referencia científica que sustenta la inclusión |
| `notes` | string | Notas sobre por qué cada señal sí/no está incluida |

**Fenómenos excluidos explícitamente**:

| Fenómeno | Razón | Evidencia | Revisar cuando |
|----------|-------|-----------|----------------|
| vientos_fuertes | wind_anomaly siempre descartada en Stage 04 | confidence.js: sin línea base cc_* | Stage 04 agregue cc_wind o CMIP6 wind_speed |
| deslizamiento | Requiere pendiente + susceptibilidad | No hay variables de terreno adecuadas | Se ingiera DEM slope + INGEMMET 2021 |
| huayco | Requiere convergencia de drenaje + pendiente | No hay variables de hidrología | Se ingiera flow accumulation + slope |

### 3.2 `thresholds.json` (sección `signal_activation`)

**Responsabilidad**: Umbrales de activación, métodos de combinación y pesos de agregación.

**Campos consumidos por Stage 05**:

| Campo | Valor | Descripción |
|-------|-------|-------------|
| `min_source_quality` | 0.30 | SQ mínimo global para incluir un fenómeno (ISO/IEC 25012 §6.1) |
| `min_signal_strength` | 0.40 | SS mínimo para conservar una señal en Stage 4 (OECD/JRC §5.2) |
| `min_phenomenon_activation` | 0.40 | SS mínimo para activar un fenómeno numérico (separado de min_signal_strength) |
| `confidence_combination` | "geometric_mean" | Método para combinar SQ × SS (geometric_mean \| min \| weighted) |
| `confidence_weights` | {source_quality: 0.5, signal_strength: 0.5} | Pesos para confidence_combination="weighted" |
| `signal_aggregation` | "arithmetic_mean" | Método para promediar SQ/SS sobre señales (arithmetic_mean \| geometric_mean \| required_first \| type_weighted) |
| `signal_aggregation_weights` | {required_weight: 1.0, optional_weight: 0.5} | Pesos para signal_aggregation="required_first" |
| `type_weights` | {anomaly: 1.0, categorical: 0.8, projected: 0.5} | Pesos por tipo de señal para signal_aggregation="type_weighted" |

---

## 4. Funciones de Config-Loader

| Función | Archivo cargado | Usado por |
|---------|----------------|-----------|
| `getPhenomenonDefinitions()` | `phenomenon-definitions.json` | index.js — definición de fenómenos |
| `getThresholds()` | `thresholds.json` | index.js — umbrales, métodos, pesos |

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.1 (ALTO): PHENOMENA_MAP hardcodeado sin justificación | phenomenon-definitions.json con scientific_reference por fenómeno |
| H-5.2 (ALTO): Fenómenos faltantes (inundación, ola_de_frio) | Agregados al config; deslizamiento/huayco excluidos documentadamente |
| H-5.3 (MEDIO): Contrato especifica config, implementación ignora | getPhenomenonDefinitions() cargado desde config |
| H-5.5 (MEDIO): Geometric mean sin documentar penalización | Análisis completo en thresholds.json _refs.confidence_combination |
| H-5.7 (MEDIO): Umbral SS reutilizado para activación de fenómeno | min_phenomenon_activation separado en thresholds.json |
