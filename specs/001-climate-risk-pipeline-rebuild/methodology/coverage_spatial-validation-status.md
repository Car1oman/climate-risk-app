# Coverage Spatial — Estado Metodológico

## Decisión

Cierre de la decisión metodológica de `coverage_spatial` para el MVP.
Aprobado como baseline oficial.

## Estado por Dimensión

| Dimensión | Estado | Notas |
|---|---|---|
| **MVP Status** | ✅ Aprobado | Modelo `exp(-d/L)` implementado, validado, 0 fallos |
| **Scientific Basis** | ✅ Aprobado | 7 referencias con DOI verificables (Jones 1997, Huffman 2001, New 2002, Bandyopadhyay 2015, Thorndike 1982, Wahr 1998, Farr 2007, Trenberth 1997) |
| **Peru Calibration** | ⏳ Pendiente | No se calibró contra estaciones SENAMHI — solo validación de plausibilidad |
| **Production Calibration** | ⏳ Pendiente | Se requiere validación empírica contra datos observacionales |

## Alcance de la Validación

La validación realizada es una **validación de plausibilidad**, no una calibración empírica.
- 9 coordenadas reales de Perú (3 Costa, 3 Sierra, 3 Selva)
- 11-13 variables por localidad
- Verificación cruzada contra valores esperados por climatología conocida
- Prueba de null propagation (distance_km null → excluded, decorrelation_length_km null → excluded)
- Matriz completa de edge cases (3 modelos de decaimiento, exclusión de variables desconocidas)

No se utilizaron datos de estaciones meteorológicas ni se estimó empíricamente el decorrelation_length real para Perú.

## Backlog

### SPATIAL-001 — Calibración empírica de decorrelation_length para Perú

**Prioridad:** Media (post-MVP)

**Objetivos:**
1. Comparar datos de estaciones SENAMHI contra puntos de grilla
2. Estimar decorrelation_length observada por variable climática
3. Evaluar diferencias entre Costa, Sierra y Selva
4. Recalibrar parámetros globales del MVP si corresponde

**Entregables:**
- Script de comparación estaciones SENAMHI ↔ grilla
- Matriz de decorrelation_length observado por variable y región
- Propuesta de recalibración con intervalos de confianza

## Recomendaciones pós-MVP

| Prioridad | Tarea | Descripción |
|---|---|---|
| 🔴 Alta | CHIRPS/PISCO para precipitación | Reemplazar NASA POWER (0.5°, cov=0.40) por CHIRPS (0.05°, cov~0.85) o PISCO SENAMHI |
| 🟡 Media | `computeResolutionRatio` real | Actualmente hardcoded a 1.0 — implementar cálculo basado en resolución nativa vs requerida |
| 🟢 Baja | Calibración regional de L por ecosistema | Costa/Sierra/Selva pueden requerir valores distintos de decorrelation_length |
| 🟢 Baja | Integración GRACE/TWSA | Procesamiento local de datos GRACE-FO desde Earthdata (NetCDF) |
