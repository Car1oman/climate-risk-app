# SPATIAL-001 — Calibración empírica de decorrelation_length para Perú

**Estado:** Pendiente
**Prioridad:** Media
**Dependencia:** MVP coverage_spatial aprobado
**Estimación:** TBD

## Contexto

El modelo de cobertura espacial `exp(-d/L)` fue aprobado como baseline del MVP
con valores globales de decorrelation_length basados en referencias bibliográficas
(New 2002, Huffman 2001, etc.). Estos valores no han sido calibrados contra datos
observacionales peruanos.

## Objetivos

1. Comparar series de estaciones SENAMHI contra puntos de grilla de las fuentes
   utilizadas (NASA POWER, Open-Meteo, CHIRPS si aplica).
2. Estimar decorrelation_length observada por variable climática para Perú.
3. Evaluar diferencias significativas entre Costa, Sierra y Selva.
4. Recalibrar los parámetros en `spatial-decorrelation.json` si corresponde,
   agregando sección `regional_overrides`.

## Variables a calibrar

- `air_temperature_current` (L actual: 500 km)
- `air_temperature_max` (L actual: 500 km)
- `air_temperature_min` (L actual: 500 km)
- `precipitation_current` (L actual: 30 km)
- `precipitation_sum` (L actual: 30 km)
- `relative_humidity` (L actual: 150 km)
- `wind_speed` (L actual: 200 km)
- `surface_pressure` (L actual: 500 km)

## Método propuesto

1. Obtener datos diarios de estaciones SENAMHI para 2010-2024
2. Para cada estación, calcular correlación espacial con estaciones vecinas
   a distintas distancias
3. Ajustar `exp(-d/L)` a la curva de correlación observada
4. Reportar L estimado con intervalo de confianza del 95%
5. Clasificar por región (Costa/Sierra/Selva) y/o por clima (Köppen)

## Entregables

- Script de análisis en `scripts/calibrate-decorrelation.mjs`
- Matriz de decorrelation_length observado por variable × región
- Propuesta de valores recalibrados para `spatial-decorrelation.json`
- Documento de resultados en `methodology/`
