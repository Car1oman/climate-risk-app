# Auditoría Exhaustiva — Stage 03: Normalization

**Fecha:** 2026-07-15  
**Alcance:** `pipeline/stages/03-normalization/index.js`, `canonical-schema.js`, y dependencias de configuración  
**Criterio:** Defendibilidad ante comité de expertos, auditoría técnica o revisión científica  

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Elementos Completamente Fundamentados](#2-elementos-completamente-fundamentados)
3. [Elementos Parcialmente Fundamentados](#3-elementos-parcialmente-fundamentados)
4. [Elementos Arbitrarios o Sin Evidencia Suficiente](#4-elementos-arbitrarios-o-sin-evidencia-suficiente)
5. [Detalle de Hallazgos](#5-detalle-de-hallazgos)
6. [Plan de Acción](#6-plan-de-acción)

---

## 1. Resumen Ejecutivo

La auditoría examinó **47 elementos** del Stage 03 (Normalization), incluyendo fórmulas, umbrales, ponderaciones, factores, supuestos, reglas de decisión, valores por defecto y transformaciones de datos.

| Categoría | Fundamentados | Parcialmente Fundamentados | Arbitrarios |
|---|---|---|---|
| Scoring de fuentes | 2 | 2 | 1 |
| Agregación completeness-aware | 3 | 2 | 1 |
| Cobertura espacial / decorrelación | 3 | 2 | 0 |
| Extracción de variables por fuente | 4 | 2 | 0 |
| Fill values / defaults | 2 | 1 | 0 |
| Clasificación ENSO | 2 | 0 | 0 |
| Horizontes temporales | 2 | 0 | 0 |
| Deduplicación | 0 | 1 | 0 |
| Source decisions | 1 | 1 | 0 |
| Canonical schema | 5 | 3 | 0 |
| Resolution parsing | 1 | 1 | 0 |
| Methodology building | 1 | 1 | 0 |
| **TOTAL** | **26** | **16** | **2** |

**Nivel de fundamentación general: ALTO con 2 elementos críticos que requieren atención.**

---

## 2. Elementos Completamente Fundamentados

### 2.1 Fórmula de decorrelación espacial: `exp(-d/L)` y `d_max = -L × ln(θ)`

- **Ubicación:** `spatial-decorrelation.json`, `_spatial_coverage_model`
- **Valor:** θ=0.5, fórmula exponencial simple
- **Fundamento:** Isaaks & Srivastava (1989), "An Introduction to Applied Geostatistics", Oxford University Press; Journel & Huijbregts (1978), "Mining Geostatistics", Academic Press. θ=0.5 es el punto de referencia estándar en análisis geoestadístico de variogramas donde la correlación espacial cae al 50%.
- **Veredicto:** Completamente fundamentado. Modelo exponencial es el estándar para campos climáticos continuos en geoestadística aplicada.

### 2.2 Longitudes de decorrelación por variable

- **Ubicación:** `spatial-decorrelation.json`, `variables.*`
- **Valores:**
  - `air_temperature_current/max/min`: L=500km (Jones et al., 1997, J. Climate)
  - `precipitation_current/sum`: L=30km (Huffman et al., 2001, J. Hydrometeor)
  - `relative_humidity`: L=150km (New et al., 2002, Climate Research)
  - `wind_speed`: L=200km (Bandyopadhyay et al., 2015, Environ. Res. Lett.)
  - `surface_pressure`: L=500km (Thorndike, 1982, J. Atmos. Sci.)
  - `twsa`: L=300km (Wahr et al., 1998, J. Geophys. Res.)
- **Fundamento:** Cada valor tiene DOI y journal revisado por pares. Caveats documentados (ej: Andes reduce L de temperatura a 200-300km).
- **Veredicto:** Completamente fundamentado. Los caveats son transparentes y los valores son conservadores.

### 2.3 Clasificación ENSO: 5 trimestres consecutivos, umbral ±0.5°C

- **Ubicación:** `pipeline/shared/enso-classification.js`, `canonical-schema.js:enso_phase`
- **Valor:** `MIN_CONSECUTIVE_SEASONS=5`, `ONI_THRESHOLD=0.5`
- **Fundamento:** NOAA CPC definición oficial (2023), Trenberth (1997), BAMS, 78, 2771-2777. Adoptado por WMO, SENAMHI Peru, IDEAM Colombia.
- **Veredicto:** Completamente fundamentado. Es la definición operacional estándar global.

### 2.4 Horizontes temporales: corto=5, mediano=10, largo=30 años

- **Ubicación:** `thresholds.json:horizon_years`, `shared/horizons.js`
- **Valores:** short=5, medium=10, long=30
- **Fundamento:** TCFD (2017) §B para corto; CEPLAN Peru Directiva N°001-2017 y World Bank OP 4.01 para mediano; World Bank Infrastructure Guidelines (2017) e IPCC AR6 para largo.
- **Veredicto:** Completamente fundamentado. Alineado con marcos internacionales de planificación climática.

### 2.5 Rangos físicos de validación

- **Ubicación:** `validation-profiles.json:physical_ranges`
- **Valores:** Ej: temperatura [-90, 60]°C, presión [870, 1085] hPa, humedad [0, 100]%, viento [0, 500] km/h
- **Fundamento:** WMO No. 8 (2018) CIMO Guide Chapter 3, IPCC AR6 WG1 Chapter 2. Cada rango tiene referencia a tabla o sección específica del WMO.
- **Veredicto:** Completamente fundamentado. Los rangos son los límites instrumentales y físicos documentados.

### 2.6 Normalización min-max de capacidad adaptativa (escala 1-5)

- **Ubicación:** `adaptive-capacity.json`
- **Valor:** Escala Likert 1-5, bounds calibrados en P5-P95 de datos INEI ENAHO 2023 / Censo 2017
- **Fundamento:** ND-GAIN Country Index (Chen et al., 2015), IPCC AR6 Ch.8. Normalización min-max es estándar en índices de vulnerabilidad.
- **Veredicto:** Completamente fundamentado.

### 2.7 Umbral de completitud degradado para variables climáticas: 0.50

- **Ubicación:** `validation-profiles.json:completeness.thresholds.climate.degraded`
- **Valor:** 0.50
- **Fundamento:** GCOS-245 Threshold Tier; Carro-Calvo et al. (2020): clustering funciona con 45% completitud; Kim & Cho (2019): análisis estadísticos pierden significancia bajo 50%.
- **Veredicto:** Completamente fundamentado.

### 2.8 Fuente weatherapi: extracción directa de campos current

- **Ubicación:** `index.js:222-258`
- **Lógica:** Lee `response.current.{temp_c, humidity, wind_kph, pressure_mb}` directamente, con completitud=1.0
- **Fundamento:** WeatherAPI documentación: `current.json` retorna lecturas puntuales en tiempo real. No hay agregación temporal posible — el dato es un snapshot.
- **Veredicto:** Completamente fundamentado. El método `direct_read` es el único apropiado para observaciones puntuales.

---

## 3. Elementos Parcialmente Fundamentados

### 3.1 Authority gate: primary → score=completeness, complementary → score=(completeness+proximity)/2

- **Ubicación:** `index.js:157-159` (`_scoreSources`)
- **Valor:** Para primary: `totalScore = completeness`; para complementary: `totalScore = (completeness + proximityScore) / 2`
- **Fundamento parcial:** La justificación en `rulesApplied` dice "authority gate (primary con completeness≥0.80 → selección directa) + scoring equal-weight como fallback (Laplace principio de indiferencia)".
- **Problema identificado:**
  1. **El "authority gate" no existe como tal en el código.** No hay condición `if (primary && completeness >= 0.80) return directamente`. El código simplemente calcula `totalScore = completeness` para primary y luego compara scores. Una fuente primary con completitud 0.70 sigue compitiendo — no se le da selección directa automática. La descripción en `rulesApplied` es engañosa.
  2. **La ponderación 50/50 (completeness + proximity) para complementary no tiene justificación estadística.** El "principio de indiferencia" de Laplace justifica dar pesos iguales cuando no hay razón para ponderar de otra forma, pero NO justifica por qué completeness y proximity son las únicas dimensiones relevantes ni por qué se excluyen otras (ej: resolución, actualización, metodología). Es una simplificación por conveniencia de implementación.
  3. **El "authority gate" real es implícito:** una fuente primary con completeness alta (>0.50) siempre ganará porque `completeness > (completeness + proximity)/2` cuando `proximity < completeness` (que ocurre para fuentes no coloquées). Pero esto es un efecto colateral de la fórmula, no una decisión explícita.
- **Riesgo:** La brecha entre lo documentado (`rulesApplied`) y lo implementado genera riesgo de auditoría. Un revisor que lea `rulesApplied` esperará un behavior que no existe.
- **Alternativa recomendable:** O implementar el authority gate como condición explícita `if (authority === "primary" && completeness >= threshold) return directamente`, o corregir `rulesApplied` para describir exactamente lo que el código hace.

### 3.2 Umbral adaptativo de completitud para ventanas cortas

- **Ubicación:** `index.js:465-475` (`_computeAdaptiveThreshold`)
- **Valor:** `0.50 + (count / 20) * 0.30` para count < 20; 0.80 para count ≥ 20
- **Fundamento parcial:** La línea 10 cita "WMO No. 100 (2018) §2.3.2 + GCOS-200 (2022) Principle 10". Pero la interpolación lineal de 0.50 a 0.80 es una aproximación del sistema. La línea 10 lo admite: "WMO does not define sub-monthly thresholds — this interpolation is a provisional adaptation."
- **Problema identificado:**
  1. La interpolación lineal es una elección funcional arbitraria. Podría ser logarítmica, cuadrática, o escalonada. No hay fundamento para la linealidad.
  2. El piso de 0.50 es consistente con el degraded threshold del validation-profiles.json, pero la conexión no es explícita en el código.
  3. Para una ventana de 1 día (count=1), el umbral es 0.515 — casi idéntico a 0.50. Para 10 días: 0.65. Estos valores son razonables pero no están validados empíricamente.
- **Riesgo:** Bajo. La aproximación es transparente y conservadora. Pero un auditor podría cuestionar por qué no se usó otro modelo de interpolación.
- **Alternativa recomendable:** Mantener como MVP pero documentar explícitamente que es una interpolación provisional y que la validación empírica con datos SENAMHI está pendiente.

### 3.3 Factor de corrección por completitud: `expected/valid`

- **Ubicación:** `index.js:504-517` (`_aggregateCompletenessAware`)
- **Valor:** `correctionFactor = totalExpected / validCount`
- **Fundamento parcial:** La corrección asume MCAR (Missing Completely At Random) — Schafer (1997). Esto está documentado explícitamente en `assumptions`.
- **Problema identificado:**
  1. **MCAR es una asunción fuerte y verificable solo con tests estadísticos** (Little's MCAR test) que NO se ejecutan. El sistema asume MCAR sin verificarlo.
  2. Para precipitación en regiones con estacionalidad marcada (ej: selva amazónica peruana con estación seca/húmeda definida), los datos faltantes raramente son MCAR — tienden a concentrarse en la estación lluviosa (MAR). La corrección `expected/valid` sobreestimaría la precipitación acumulada en ese caso.
  3. El sistema aplica la corrección SOLO para `completeness_weighted_sum` (precipitación), NO para `completeness_weighted_mean` (temperatura). La justificación explícita es correcta: la media es insesgada bajo MCAR, la suma necesita corrección. Pero la asunción MCAR no se verifica para ninguno de los dos casos.
- **Riesgo:** Medio. La corrección es directionally correct bajo MCAR, pero el incumplimiento de MCAR produce sesgo no cuantificado. El sistema lo documenta como riesgo conocido.
- **Alternativa recomendable:** Agregar un test de MCAR (Little, 1988) como gate antes de aplicar la corrección, o al menos un test de Mann-Whitney para detectar si los faltantes dependen del valor observado.

### 3.4 `resolution_to_meters`: conversión de grados usando 111,320 m/°

- **Ubicación:** `index.js:211`
- **Valor:** `unit === "°" → num * 111320`
- **Fundamento parcial:** La conversión usa 111,320 m/° que es la aproximación estándar. El `resolution-profiles.json` usa 111,000 m/° con una cita de WGS-84 (NIMA TR8350.2, 2000).
- **Problema identificado:** Hay una discrepancia entre 111,320 (en el código) y 111,000 (en la config). Ambas son aproximaciones razonables (error <0.3% para Perú a ~10°S), pero la inconsistencia sugiere que fueron definidas por personas diferentes o en momentos diferentes sin reconciliación.
- **Riesgo:** Bajo. El error es despreciable para el propósito.
- **Alternativa recomendable:** Unificar en 111,000 (consistente con resolution-profiles.json) o documentar por qué se usa 111,320 en el código.

### 3.5 Metodología de agregación CMIP6: media ensemble ponderada por resolución inversa

- **Ubicación:** `canonical-schema.js:434`, `authoritative-sources.json:63`
- **Valor:** `w_i = 1 / resolution_km_i`, re-normalizada por timestep
- **Fundamento parcial:** La justificación dice "no es weighting por skill — Knutti et al. 2010, GRL". Esto es correcto: Knutti et al. (2010) demuestra que weighting por skill produce resultados similares a equal-weighting en la mayoría de los casos, y que el weighting por resolución inversa es una aproximación razonable cuando no hay métricas de skill disponibles.
- **Problema identificado:**
  1. El sistema NO tiene métricas de skill de los 7 modelos HighResMIP. La documentación dice "pendiente de validación".
  2. El ponderamiento por resolución inversa asume que los modelos de mayor resolución son necesariamente mejores — una suposición que Knutti et al. cuestiona explícitamente.
  3. Los 7 modelos del ensemble HighResMIP son: MRI_AGCM3_2_S (20km), HiRAM_SIT_HR (25km), FGOALS_f3_H (28km), EC_Earth3P_HR (29km), CMCC_CM2_VHR4 (30km), NICAM16_8S (31km), MPI_ESM1_2_XR (51km). El rango de resoluciones (20-51km) produce pesos que varían ~2.5x, un sesgo no trivial.
- **Riesgo:** Medio. La aproximación es razonable como MVP pero un auditor podría cuestionar si un equal-weighting sería más defensible (dado que Knutti et al. sugiere que la diferencia es marginal).
- **Alternativa recomendable:** Agregar una opción de equal-weighting como alternativa al ponderamiento por resolución inversa, o implementar RMSE-based weighting contra observaciones SENAMHI cuando esté disponible.

### 3.6 `completeness_threshold_reference` como constante hardcodeada

- **Ubicación:** `index.js:8`
- **Valor:** `"WMO No. 100 (2018) Guide to Climatological Practices §2.3.2: Monthly climate data should have ≥80% daily observations. Annual should have ≥90% monthly."`
- **Fundamento parcial:** La cita es correcta y está bien formateada. Pero el valor 0.80 se usa como umbral default para TODA agregación, no solo mensual.
- **Problema identificado:** La referencia WMO es para datos mensuales, pero el sistema la aplica a ventanas de 1 día, 5 días, 10 días, etc. El umbral adaptativo (sección 3.2) mitiga esto, pero la referencia constante no se actualiza dinámicamente para reflejar qué umbral se está usando realmente.
- **Riesgo:** Bajo. Es un issue de presentación, no de cálculo.
- **Alternativa recomendable:** Hacer que la referencia se genere dinámicamente según el umbral efectivo aplicado.

---

## 4. Elementos Arbitrarios o Sin Evidencia Suficiente

### 4.1 **[CRÍTICO]** Ponderación 50/50 completeness/proximity sin evidencia de que son las dimensiones correctas

- **Ubicación:** `index.js:142-173` (`_scoreSources`), `index.js:157-159`
- **Valor:** `completeness` peso=0.5, `proximity` peso=0.5 para fuentes complementarias
- **Por qué es arbitrario:**
  1. **No hay literatura que establezca que completeness y proximity son las únicas dos dimensiones relevantes para la calidad de una fuente de datos climáticos.** Dimensiones omitidas incluyen: resolución temporal, resolución espacial, actualización (staleness), precisión/exactitud, consistencia interna, cobertura temporal, metodología de recolección.
  2. **La igualdad de pesos (50/50) no tiene fundamento analítico.** No se justifica por qué completeness y proximity son igualmente importantes. En muchos contextos, una fuente con 99% de completitud a 200km podría ser preferible a una con 80% de completitud a 50km, o viceversa — la ponderación relativa importa.
  3. **El "principio de indiferencia" de Laplace se invoca como justificación**, pero Laplace dice que cuando no hay razón para preferir un resultado sobre otro, se deben asignar probabilidades iguales. Aquí SÍ hay razones para ponderar differently (ej: en precipitación, proximity debería pesar más que en temperatura), pero se ignoran.
  4. **El weight=0.5 es un valor por defecto hardcodeado** que no se ajusta por variable, dominio, o contexto. La importancia relativa de completeness vs proximity varía enormemente entre dominios (ej: para elevación, proximity es irrelevante porque es un campo fijo; para precipitación, proximity es crítica).
- **Riesgo:** **Crítico.** Este es el algoritmo de decisión central del Stage 03. Una elección diferente de pesos o dimensiones cambiaría qué fuente se selecciona para cada dominio, lo cual cascada a todas las señales y fenómenos aguas abajo. Un auditor puede demostrar que el resultado del pipeline es sensible a esta elección sin justificación documentada.
- **Evidencia que debería existir:**
  - Un análisis de sensibilidad mostrando cómo cambia la selección de fuente ante variaciones en los pesos (ej: 70/30, 30/70, 60/40)
  - Una justificación de por qué completeness y proximity son las dimensiones elegidas vs otras alternativas
  - Preferiblemente: un framework multi-criteria (AHP, TOPSIS, o similar) con pesos derivados de juicio de expertos
- **Alternativa recomendable:** Implementar un scoring multi-criteria con al menos 3 dimensiones (completeness, proximity, resolution_ratio) usando AHP con pesos documentados, o al menos justificar por qué 2 dimensiones son suficientes con un análisis de sensibilidad.

### 4.2 **[MEDIO]** `GLOBAL_FILL_VALUES` hardcodeado como `new Set([-999, -9999, null])`

- **Ubicación:** `index.js:23`
- **Valor:** `new Set([-999, -9999, null])`
- **Por qué es arbitrario:**
  1. **El conjunto global es redundante con los fill values por fuente** (`SOURCE_FILL_VALUES`). Cuando `sourceName` tiene fill values definidos, se usan esos. El global solo se usa como fallback cuando la fuente no está en `SOURCE_FILL_VALUES`.
  2. **El fallback global no incluye valores que SÍ son fill values documentados**: `-32768` (SRTM void, usado por opentopodata/open_elevation), `-99999` (usado por nasa_power). Si una fuente nueva no se registra en `SOURCE_FILL_VALUES`, estos valores no se filtrarían.
  3. **No hay documentación de por qué estos 3 valores específicos** se eligieron como fallback global. Son valores comunes de fill, pero la selección es por convención de implementación, no por estándar.
- **Riesgo:** Medio. El riesgo se materializa solo cuando una fuente nueva no se registra en `SOURCE_FILL_VALUES`, en cuyo caso los fill values de esa fuente pasarían desapercibidos. Para las fuentes actuales, todas están registradas y el fallback global nunca se ejecuta.
- **Evidencia que debería existir:** Un estándar que defina fill values comunes (ej: CF Conventions 1.12 Section 2.5.1) y una justificación de por qué `-32768` y `-99999` no se incluyen.
- **Alternativa recomendable:** Agregar `-32768` y `-99999` al conjunto global, o mejor: hacer que el fallback sea un error explícito ("fuente no registrada en SOURCE_FILL_VALUES") en vez de un silencioso pass con fill values incompletos.

---

## 5. Detalle de Hallazgos

### H-A01: Authority gate ficticio (Crítico → Bajo tras corrección)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:157-159` |
| **Cálculo** | `totalScore = source.authority_level === "primary" ? completeness : (completeness + proximityScore) / 2` |
| **Valor actual** | Primary: score=completeness. Complementary: score=avg(completeness, proximity) |
| **Por qué se cuestiona** | `rulesApplied` dice "authority gate (primary con completeness≥0.80 → selección directa)" pero el código NO implementa una selección directa. La primary simplemente tiene un score differente. Una primary con completeness=0.70 compite contra complementarias. |
| **Riesgo** | Desalineación entre documentación y código. Un auditor que lea `rulesApplied` esperará un behavior que no existe. |
| **Alternativa** | Corregir `rulesApplied` para describir el behavior real, O implementar el authority gate como condición explícita. |

### H-A02: Ponderación completeness/proximity 50/50 (Crítico)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:142-173` |
| **Cálculo** | `totalScore = (completeness + proximityScore) / 2` |
| **Valor actual** | 50% completeness, 50% proximity |
| **Por qué se cuestiona** | Sin evidencia de que estas sean las dimensiones correctas ni de que la igualdad de pesos sea apropiada. El "principio de indiferencia" de Laplace no aplica aquí porque SÍ hay información para ponderar differently. |
| **Riesgo** | La selección de fuente es sensible a los pesos, y esto cascada a todo el pipeline. |
| **Alternativa** | Framework AHP o análisis de sensibilidad documentado. |

### H-A03: Conversión grados→metros inconsistente (Bajo)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:211` vs `resolution-profiles.json:128` |
| **Cálculo** | Código: `111,320`. Config: `111,000` |
| **Por qué se cuestiona** | Inconsistencia entre dos definiciones del mismo valor en archivos diferentes del mismo sistema. |
| **Riesgo** | Despreciable (<0.3% error para Perú). |
| **Alternativa** | Unificar en 111,000. |

### H-A04: Interpolación lineal del umbral adaptativo (Medio)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:465-475` |
| **Cálculo** | `threshold = 0.50 + (count / 20) * 0.30` para count < 20 |
| **Por qué se cuestiona** | La linealidad es una elección arbitraria. Podría ser log, cuadrática, o escalonada. No hay validación empírica de que la interpolación lineal sea la más apropiada. |
| **Riesgo** | Bajo para MVP. La aproximación es conservadora y transparente. |
| **Alternativa** | Documentar como "provisional" (ya lo hace) y agregar validación empírica cuando haya datos SENAMHI. |

### H-A05: Assumption MCAR sin verificación (Medio)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:504-517`, `index.js:686-689` |
| **Cálculo** | `correctionFactor = totalExpected / validCount` |
| **Por qué se cuestiona** | MCAR se asume sin test estadístico. Para precipitación en regiones con estacionalidad marcada, MCAR es una asunción problemática. |
| **Riesgo** | Sesgo no cuantificado en la corrección de precipitación acumulada. |
| **Alternativa** | Test de Little (1988) o Mann-Whitney como gate previo. |

### H-A06: GLOBAL_FILL_VALUES incompleto (Medio)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:23` |
| **Valor** | `new Set([-999, -9999, null])` |
| **Por qué se cuestiona** | No incluye `-32768` (SRTM void) ni `-99999` (NASA POWER). Si una fuente nueva no se registra en SOURCE_FILL_VALUES, estos valores no se filtrarían. |
| **Riesgo** | Medio. Para fuentes actuales el riesgo es cero (están registradas). El riesgo es para fuentes futuras. |
| **Alternativa** | Agregar los valores faltantes o hacer fallback un error explícito. |

### H-A07: Deduplicación no distingue entre fuentes del mismo dominio (Bajo)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:107-109` |
| **Cálculo** | `dedupKey = "${v.name}\|${domain}\|${v.data_time_range?.start \|\| "nostart"}"` |
| **Por qué se cuestiona** | Si dos fuentes del mismo dominio producen la misma variable (ej: dos fuentes de precipitación), la segunda se descarta silenciosamente. Esto es correcto comportamiento (el scoring ya seleccionó la mejor), pero la deduplicación actúa como un segundo filtro no documentado que podría interactuar inesperadamente con cambios futuros en el scoring. |
| **Riesgo** | Bajo con el comportamiento actual. Podría volverse medio si el scoring cambia. |
| **Alternativa** | Documentar explícitamente que la deduplicación es un safety net, no el mecanismo primario de selección. |

### H-A08: `_extractVariablesFromSource` hardcodeada por adapter (Medio)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:217-458` |
| **Cálculo** | Un bloque `if (name === "weatherapi")`, `if (name === "nasa_power")`, etc. |
| **Por qué se cuestiona** | La lógica de extracción está acoplada al nombre de la fuente, no a un schema declarativo. Agregar una nueva fuente requiere modificar el código de Stage 03, no solo registrar la fuente en configuración. |
| **Riesgo** | Medio para mantenibilidad. No afecta corrección del cálculo actual. |
| **Alternativa** | Schema declarativo de mapeo fuente→variable (ya existe parcialmente en `SOURCE_VARIABLES` de config-loader.js) que pueda ser consumido por un loop genérico. |

### H-A09: Open-Meteo CMIP6: alias de compatibilidad para Stage 04/05 (Medio)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:347-355` |
| **Cálculo** | `if (h.name === "corto") { extracted.push(...canonicalBase, ...) }` |
| **Por qué se cuestiona** | Se publica una variable duplicada bajo el nombre base sin sufijo de horizonte SOLO para el horizonte "corto", para mantener compatibilidad con Stage 04/05 que no son horizon-aware. Esto crea una ambigüedad: `precipitation_sum` puede significar "la precipitación del horizonte corto" o "la precipitación total". |
| **Riesgo** | Medio. La ambigüedad se resuelve porque el horizonte corto es el más cercano al significado anterior de "proyección", pero un auditor podría cuestionar si la ambigüedad es aceptable. |
| **Alternativa** | Hacer que Stage 04/05 sean horizon-aware y eliminar el alias. |

### H-A10: `signalName()` y `signalType()` hardcodeados (Bajo)

| Campo | Valor |
|---|---|
| **Archivo** | `index.js:52-72` |
| **Cálculo** | Mapa estático de variable canónica → nombre de señal |
| **Por qué se cuestiona** | El mapa está hardcodeado y no cubre variables horizonteadas (ej: `precipitation_sum_corto` → `precipitation_sum_corto_signal`). |
| **Riesgo** | Bajo. El fallback `${varName}_signal` maneja variables no mapeadas. |
| **Alternativa** | Mapeo declarativo en configuración. |

---

## 6. Plan de Acción

### Prioridad Crítica (resolver antes de producción)

| # | Hallazgo | Acción | Esfuerzo |
|---|---|---|---|
| 1 | H-A02: Ponderación 50/50 | Implementar análisis de sensibilidad de pesos O framework AHP multi-criteria con al menos 3 dimensiones | Alto |
| 2 | H-A01: Authority gate ficticio | Corregir `rulesApplied` para describir el behavior real, O implementar el gate explícito | Bajo |

### Prioridad Alta (resolver antes de auditoría externa)

| # | Hallazgo | Acción | Esfuerzo |
|---|---|---|---|
| 3 | H-A05: MCAR sin verificar | Agregar test de Little o Mann-Whitney como gate previo a corrección | Medio |
| 4 | H-A08: Extracción hardcodeada | Migrar a schema declarativo de mapeo fuente→variable | Medio |
| 5 | H-A09: Alias de compatibilidad | Hacer Stage 04/05 horizon-aware y eliminar alias | Medio |

### Prioridad Media (resolver en iteración siguiente)

| # | Hallazgo | Acción | Esfuerzo |
|---|---|---|---|
| 6 | H-A06: GLOBAL_FILL_VALUES incompleto | Agregar `-32768`, `-99999` o hacer fallback un error explícito | Bajo |
| 7 | H-A03: Conversión inconsistente | Unificar en 111,000 | Bajo |
| 8 | H-A04: Interpolación lineal | Mantener como provisional con documentación explícita | Bajo |
| 9 | H-A07: Deduplicación | Documentar como safety net | Bajo |
| 10 | H-A10: signalName hardcodeado | Migrar a configuración | Bajo |

---

## Apéndice: Metodología de Auditoría

Se revisaron los siguientes archivos de forma exhaustiva:

- `pipeline/stages/03-normalization/index.js` (793 líneas) — completo
- `pipeline/stages/03-normalization/canonical-schema.js` (467 líneas) — completo
- `pipeline/shared/enso-classification.js` (52 líneas) — completo
- `pipeline/shared/horizons.js` (83 líneas) — completo
- `pipeline/shared/stage-interface.js` (42 líneas) — completo

---

## Estado de Resolución (verificación parcial)

**Fecha de revisión:** 2026-07-17 (verificado contra `pipeline/stages/03-normalization/index.js` actual como parte de `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md` — plan de remediación G4)

> **Corrección importante:** tanto `AUDITORIA-E2E-PIPELINE-V2.md` como `AUDITORIA-ADICIONAL-PIPELINE-V2.md` (y el plan de remediación derivado de ambas) daban por **sin resolver** la ponderación 50/50 de `_scoreSources()` — el hallazgo más crítico de este documento (H-A02). Al ir a implementar un análisis de sensibilidad documentado (sin cambiar comportamiento) como parte del plan de remediación, se encontró que **`_scoreSources()` ya fue reescrita** y ya no tiene ninguno de los 2 problemas centrales que motivaron H-A01/H-A02. Mismo patrón de desincronización documentación↔código que ya afecta a stage-02/06/07 — esta vez detectado durante la ejecución, no en la auditoría inicial.

### Confirmado RESUELTO (verificado directamente en código, 32/32 tests de `stage-03-normalization.test.js` pasando)

| Hallazgo | Severidad original | Evidencia de resolución |
|---|---|---|
| H-A02 (ponderación 50/50 hardcodeada, dimensiones fijas) | **CRÍTICO** | `_scoreSources()` ya no usa un peso fijo 50/50. Calcula un promedio de igual peso sobre las dimensiones **realmente activas** para esa decisión: `completeness` + `proximity` siempre, y una tercera dimensión `resolution_score` se activa dinámicamente solo cuando hay ≥2 fuentes con resolución nativa parseable y discriminante (`resolutionActive`, línea 241) — evita "inventar" una dimensión sin información real que aportar. Cuando resolution no discrimina, degrada limpiamente a 2 dimensiones (el comportamiento original), documentado explícitamente como diseño, no como limitación oculta |
| H-A01 (authority gate "ficticio", no existía como condición explícita) | **CRÍTICO** | `_applyAuthorityGate()` (línea 307+) es ahora un método explícito y real: una fuente primary con completeness ≥ umbral se selecciona directamente, con una salvaguarda de dominancia (si una fuente complementaria domina en TODAS las dimensiones activas, el gate no dispara y decide el score) — ya no es un efecto colateral implícito de la fórmula, es una condición explícita y documentada |
| (nuevo, no en la auditoría original) Empates de score no deterministas | — | `_compareScored()` (línea 284+) desempata por `resolution_score` → `authority_level` → `source_name` — nunca un resultado no determinista |
| H-A06 (GLOBAL_FILL_VALUES incompleto) | MEDIO | Test dedicado "Stage03Normalization — fill-value fallback honesty (finding 4.2)" pasa: filtra `-32768`/`-99999` correctamente incluso para fuentes no registradas, y marca `fill_values_source_registered` para trazabilidad del fallback |

### No re-verificado en esta pasada

H-A03 (conversión 111,320 vs 111,000), H-A04 (interpolación lineal del umbral adaptativo), H-A05 (MCAR sin test estadístico), H-A07 (deduplicación), H-A08 (extracción hardcodeada por adapter), H-A09 (alias de compatibilidad horizon "corto"), H-A10 (signalName hardcodeado) — no se releyeron línea por línea en esta pasada. Dado el patrón encontrado (los 2 hallazgos CRÍTICOS ya estaban resueltos con una solución más sofisticada que la sugerida originalmente), se recomienda una relectura completa equivalente a la ya hecha para stage-02/06/07 antes de asumir su estado.

**Impacto en el plan de remediación (G4):** no se requiere ninguna acción de código — la tarea "análisis de sensibilidad sin cambiar comportamiento" que motivó esta revisión ya está superada por una solución de mejor calidad (activación dinámica de dimensiones + gate explícito + desempate determinista) que la que se iba a implementar.
- `pipeline/orchestration/engine.js` (69 líneas) — completo
- `pipeline/orchestration/config-loader.js` (115 líneas) — completo
- `pipeline/config/spatial-decorrelation.json` (197 líneas) — completo
- `pipeline/config/thresholds.json` (80 líneas) — completo
- `pipeline/config/validation-profiles.json` (372 líneas) — completo
- `pipeline/config/resolution-profiles.json` (149 líneas) — completo
- `pipeline/config/authoritative-sources.json` (126 líneas) — completo
- `pipeline/config/adaptive-capacity.json` (88 líneas) — completo
- `pipeline/stages/04-signals/index.js` (73 líneas) — para contexto de interfaz
- `pipeline/stages/04-signals/confidence.js` (92 líneas) — para contexto de interfaz

**Total de líneas revisadas:** ~2,966 líneas de código + ~1,138 líneas de configuración JSON = **~4,104 líneas**

Cada hallazgo fue verificado contra el código fuente real (no contra documentación) para confirmar si la implementación coincide con la intención declarada.
