# Stage Guide — Climate Risk Pipeline v2

## Architecture

```
Location + Sector
  → [01] Acquisition       — consulta 11 fuentes en paralelo
  → [02] Validation        — schema, fill values, cobertura espacial
  → [03] Normalization     — variables canónicas, selección autoritativa
  → [04] Signals           — source_quality + signal_strength
  → [05] Phenomena         — consolidación en fenómenos
  → [06] Risk              — (P × I) / CA, transición
  → [07] Presentation      — executive | analyst view
  → EvidenceArtifact v2.0
```

## Stage 01 — Acquisition

**Propósito**: Consultar todas las fuentes externas en paralelo con manejo individual de errores.

**11 adapters**:
| Adapter | Fuente | Dominio |
|---------|--------|---------|
| `weatherapi.js` | WeatherAPI | observation_current |
| `nasa-power.js` | NASA POWER | observation_historical |
| `openmeteo.js` | Open-Meteo CMIP6 | projection_climate |
| `opentopodata.js` | OpenTopoData SRTM30m | elevation |
| `gri-oxford.js` | GRI Oxford | geophysical_exposure |
| `worldbank.js` | World Bank | socioeconomic |
| `gracefo.js` | GRACE-FO JPL | groundwater |
| `noaa-oni.js` | NOAA CPC ONI | enso |
| `supabase.js` | Supabase climate_cells | precomputed_grid |
| `open-elevation.js` | Open Elevation | elevation (complementary) |
| `noaa-enso.js` | NOAA ENSO Discussion | enso (complementary) |

**Reglas**:
- Timeout individual por fuente (15-30s)
- Falla de una fuente no detiene las demás
- Respuesta cruda se conserva completa
- No hay transformación en esta etapa

## Stage 02 — Validation

**Propósito**: Validar esquema, detectar fill values, verificar cobertura espacial.

**Validaciones por fuente**:
1. Schema validation — campos requeridos, tipos, rangos
2. Fill value detection — valores centinela (-999, 9999, null)
3. Spatial coverage — distancia vs umbral configurable
4. Completeness — % de campos no nulos

**Cobertura espacial**:
- Distancia < umbral → "available"
- Distancia entre umbrales → "available" con penalización
- Distancia > umbral máximo → "out_of_coverage"

## Stage 03 — Normalization

**Propósito**: Mapear respuestas de fuentes a variables canónicas normalizadas.

**Canonical Schema**: 20 variables canónicas (temperatura, precipitación, humedad, elevación, población, etc.)

**Selección autoritativa**: Por dominio, la fuente primaria tiene prioridad. Complementarias se usan solo si la primaria falla.

**Cobertura**: direct (misma coordenada), nearest_neighbor (celda más cercana), interpolated (promedio de celdas vecinas), out_of_coverage (sin datos).

## Stage 04 — Signals

**Propósito**: Generar señales climáticas con confianza bidimensional.

**Source Quality** (5 componentes con pesos fijos):
- coverage_spatial (30%) — calidad de la cobertura geográfica
- coverage_temporal (20%) — extensión de la serie temporal
- data_completeness (20%) — % de campos no nulos
- resolution (20%) — resolución espacial nativa
- proximity (10%) — distancia al punto de datos

**Signal Strength** (4 componentes):
- anomaly_magnitude — magnitud de la desviación
- temporal_persistence — consistencia en el tiempo
- cross_period_consistency — consistencia entre períodos
- projected_change — magnitud del cambio proyectado

Ambos siempre se reportan separados, nunca colapsados.

## Stage 05 — Phenomena

**Propósito**: Consolidar señales en fenómenos climáticos detectables.

**Mapa de correspondencia**:
| Fenómeno | Señales |
|----------|---------|
| ola_de_calor | temperatura_actual_anomaly, temperatura_max_projection |
| sequía | precipitacion_projection, humidity_anomaly |
| vientos_fuertes | wind_anomaly |

**Confianza combinada**: media geométrica de source_quality y signal_strength.

## Stage 06 — Risk

**Propósito**: Calcular riesgo climático físico y de transición.

**Fórmula**: `riesgo = (Probabilidad × Impacto) / Capacidad Adaptativa`

**Probabilidad**: Híbrida — fuente externa si existe (GRI ISIMIP), sino cálculo interno desde signal_strength.

**Impacto**: Siempre cálculo interno desde exposición + sensibilidad del sector + CA.

**Capacidad Adaptativa**: Promedio ponderado de indicadores socioeconómicos (pobreza, GDP, acceso agua, infraestructura, urbanización).

**Riesgos de transición**: Evaluados por perfil sectorial — regulatorio, mercado, tecnología, reputacional.

## Stage 07 — Presentation

**Propósito**: Proyectar resultados según nivel de audiencia.

**Executive View**:
- Semáforos de riesgo (bajo/medio/alto → verde/ámbar/rojo)
- Nombres de fenómenos en lenguaje natural
- Resumen ejecutivo (template-based, sin IA)
- Recomendaciones priorizadas
- Nota de confianza en una frase
- Sin códigos técnicos, JSON crudo, stack traces

**Analyst View**: Extiende executive con:
- Fuentes consultadas y estado
- Source Quality desglosado
- Cálculo de riesgo paso a paso
- Riesgos de transición

## EvidenceArtifact

Artefacto JSON auto-contenido v2.0. SSOT del pipeline.

**Estructura**:
- `artifact_id`, `execution_id`, `version`, `created_at`
- `pipeline_summary` — conteo de etapas, estado global
- `stages[]` — artefacto por etapa con input/output/rules/duration/status
- `final_result[]` — RiskAssessment[]
- `narratives` — { executive, analyst }
- `rules_applied` — todas las reglas del pipeline
