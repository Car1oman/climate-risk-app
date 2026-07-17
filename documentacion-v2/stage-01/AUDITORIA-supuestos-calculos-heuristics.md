# AUDITORÍA — Supuestos, Cálculos Heurísticos y Decisiones sin Sustento Completo

**Documento de Auditoría — Stage 01 Acquisition**

| Campo | Valor |
|---|---|
| **Alcance** | Código completo de `pipeline/stages/01-acquisition/` |
| **Fecha** | 2026-07-14 |
| **Propósito** | Identificar supuestos, cálculos heurísticos y decisiones que requieren justificación adicional para defensa ante auditoría |

---

## Resumen Ejecutivo

Se identificaron **8 hallazgos** clasificados por severidad:

| Severidad | Cantidad | Descripción |
|---|---|---|
| **Crítica** | 2 | Supuestos sin fundamento que afectan la corrección del análisis |
| **Alta** | 2 | Cálculos con justificación parcial o interpretación cuestionable |
| **Media** | 2 | Parámetros hardcodeados sin documentación de origen |
| **Baja** | 2 | Simplificaciones aceptables pero que deben documentarse |

---

## HALLAZGO-1 [CRÍTICA] — País hardcodeado en World Bank adapter

**Archivo**: `pipeline/stages/01-acquisition/adapters/worldbank.js:12`

```javascript
const country = "PE";
```

**Problema**: El adapter World Bank está hardcodeado para Perú (`"PE"`). El pipeline recibe `location: { lat, lon }` pero **nunca convierte coordenadas a país**. Si se consulta una ubicación en Colombia o Chile, el adapter retornará indicadores de Perú silenciosamente.

**Impacto**: Datos socioeconómicos incorrectos para cualquier ubicación fuera de Perú. El `source_domain: "socioeconomic"` contendrá datos de Perú sin importar la ubicación real.

**Sustento actual**: Ninguno. El valor `"PE"` no tiene justificación en el código ni en la configuración.

**Acción requerida**: 
1. Opción A: Implementar geocoding inverso para determinar el país desde las coordenadas.
2. Opción B: Recibir `country` como parámetro de input en `LocationSchema`.
3. Opción C (MVP): Documentar explícitamente que el sistema está limitado a Perú y agregar validación en `execute()` que rechace ubicaciones fuera de Perú.

**Estado**: **SIN RESOLVER — Requiere decisión de diseño**

---

## HALLAZGO-2 [CRÍTICA] — Cálculo de `ENSEMBLE_SPATIAL_DISTANCE_KM` con interpretación Nyquist cuestionable

**Archivo**: `pipeline/stages/01-acquisition/adapters/openmeteo.js:22-24`

```javascript
const KM_PER_DEG = 111;
const ENSEMBLE_SPATIAL_DISTANCE_KM =
  Math.max(...Object.values(CMIP6_RESOLUTION_DEG)) * KM_PER_DEG / 2; // 111 km
```

**Problema**: El cálculo usa el criterio de Nyquist (`resolución_gruesa × 111 km/° / 2`) para estimar la distancia espacial máxima. El comentario dice "conservative upper bound on grid-point error".

**Cuestionamiento**: 
- El criterio de Nyquist se aplica a muestreo de señales, no a errores de representatividad de modelos climáticos. La distancia donde un modelo CMIP6 "representa" un punto no es equivalente al criterio de Nyquist.
- Usar la resolución del modelo más grueso (FGOALS_g3, 2°) para todo el ensemble es conservador, pero ¿es correcto? Si solo se usan modelos de mayor resolución, la distancia debería ser menor.
- La fórmula `2° × 111 km/° / 2 = 111 km` es correcta aritméticamente, pero la interpretación física es discutible.

**Sustento actual**: Comentario inline sin referencias. No hay citation científica para esta interpretación específica.

**Acción requerida**: 
1. Documentar la justificación de por qué se usa Nyquist para errores de representatividad de CMIP6.
2. O alternativamente, usar el modelo de decorrelación espacial de `spatial-decorrelation.json` (que SÍ tiene sustento: exponential decay model, Isaaks & Srivastava 1989).
3. Agregar referencia científica para la interpretación Nyquist en este contexto.

**Estado**: **SIN RESOLVER — Requiere justificación científica**

---

## HALLAZGO-3 [ALTA] — `spatial_distance_km` hardcodeado en adapters estáticos

**Archivo**: Múltiples adapters

| Adapter | `spatial_distance_km` | Justificación actual |
|---|---|---|
| `weatherapi` | `0` | "Punto exacto (interpolación al punto)" |
| `nasa_power` | `27.5` | `0.5°/2 × 111 km/°` (Nyquist half-cell) |
| `openmeteo` | `111` | `2°/2 × 111 km/°` (Nyquist, modelo más grueso) |
| `opentopodata` | `0` | "DEM puntual" |
| `open_elevation` | `0` | "DEM puntual" |

**Problema**: 
- WeatherAPI (`spatial_distance_km: 0`) declara distancia cero, pero WeatherAPI usa interpolación de estaciones meteorológicas. La resolución efectiva no es "punto exacto" — es "~2km interpolado por vendor". La distancia real al punto de medición más cercano puede ser de varios kilómetros.
- NASA POWER (`27.5`) usa Nyquist half-cell, que es una convención de muestreo, no una medida de distancia al punto de medición más cercano.
- OpenTopoData/Open-Elevation (`0`) son más justificables — SRTM 30m es un DEM puntual.

**Sustento actual**: Valores hardcodeados sin referencia científica. No hay distinción entre "distancia al punto de medición más cercano" y "error de representatividad del grid".

**Acción requerida**: 
1. Definir qué significa `spatial_distance_km` en el contexto de este pipeline: ¿distancia al punto de medición? ¿error de representatividad? ¿ambos?
2. Documentar la justificación de cada valor.
3. Para WeatherAPI, considerar usar la resolución declarada (~2km) en lugar de 0.

**Estado**: **SIN RESOLVER — Requiere definición semántica del campo**

---

## HALLAZGO-4 [ALTA] — Clasificación ENSO simplificada en `noaa-enso.js`

**Archivo**: `pipeline/stages/01-acquisition/adapters/noaa-enso.js:15-19`

```javascript
let enso_state = "neutral";
if (latest) {
  if (latest.anom >= 0.5) enso_state = "el_nino";
  else if (latest.anom <= -0.5) enso_state = "la_nina";
}
```

**Problema**: La clasificación ENSO usa el valor más reciente del ONI (anomalía trimestral). La definición oficial de NOAA CPC requiere **5 trimestres consecutivos superiores/iguales a 0.5°C** para clasificar como El Niño (Trenberth 1997).

**Cuestionamiento**: 
- ¿Es aceptable usar el valor más reciente para un MVP, o debe implementarse la regla de 5 trimestres?
- La regla simplificada puede clasificar erróneamente eventos transitorios como El Niño/La Niña.

**Sustento actual**: El umbral de 0.5°C SÍ tiene sustento (Trenberth 1997, NOAA CPC). Pero la simplificación a un solo trimestre no tiene justificación documentada.

**Acción requerida**: 
1. Documentar que la clasificación simplificada es una aproximación de MVP.
2. Agregar referencia a la definición oficial de NOAA CPC.
3. Considerar implementar la regla de 5 trimestres para mayor rigor.

**Estado**: **SIN RESOLVER — Requiere decisión de MVP vs. rigor científico**

---

## HALLAZGO-5 [MEDIA] — Buffer de búsqueda hardcodeado en Supabase adapter

**Archivo**: `pipeline/stages/01-acquisition/adapters/supabase.js:33`

```javascript
const buffer = 0.5;
```

**Problema**: El buffer de búsqueda de 0.5° (~55km) para encontrar celdas climáticas cercanas está hardcodeado sin justificación.

**Cuestionamiento**: 
- ¿Por qué 0.5° y no 0.25° (resolución del grid) o 1.0°?
- ¿Qué tan denso es el grid de `climate_cells`? Si las celdas están cada 0.25°, un buffer de 0.5° garantiza encontrar al menos una celda.
- ¿Qué pasa si no hay celdas en el radio?

**Sustento actual**: Ninguno. El valor 0.5 no tiene documentación de origen.

**Acción requerida**: 
1. Documentar la razón del buffer de 0.5° (basado en la resolución del grid: 0.25° × 2 = 0.5° para garantizar cobertura).
2. O hacer el buffer configurable desde `authoritative-sources.json`.

**Estado**: **SIN RESOLVER — Requiere justificación**

---

## HALLAZGO-6 [MEDIA] — Rango de fechas hardcodeado en Open-Meteo adapter

**Archivo**: `pipeline/stages/01-acquisition/adapters/openmeteo.js:54-55`

```javascript
start_date: "2020-01-01",
end_date: "2050-12-31",
```

**Problema**: El rango de fechas para proyecciones CMIP6 está hardcodeado de 2020 a 2050.

**Cuestionamiento**: 
- ¿Por qué 2020 como inicio? Los escenarios CMIP6 típicamente empiezan en 2015 o 2021.
- ¿Por qué 2050 como fin? IPCC AR6 usa horizontes 2030, 2050, 2100.
- ¿Debería ser configurable por el caller?

**Sustento actual**: Ninguno. Los valores no tienen documentación de origen.

**Acción requerida**: 
1. Documentar por qué se eligieron estos rangos específicos.
2. Considerar hacer el rango configurable desde el input del pipeline o desde configuración.

**Estado**: **SIN RESOLVER — Requiere justificación**

---

## HALLAZGO-7 [BAJA] — `injectEnsembleMeans` como media aritmética simple

**Archivo**: `pipeline/stages/01-acquisition/adapters/openmeteo.js:32-47`

```javascript
return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
```

**Problema**: El promedio del ensemble CMIP6 es una media aritmética simple de los 4 modelos. No hay pesos por resolución, skill, o disponibilidad de datos.

**Cuestionamiento**: 
- ¿Es la media aritmética la aproximación correcta para un ensemble de 4 modelos con resoluciones diferentes?
- IPCC AR6 usa "multi-model mean" sin pesos para muchos productos, pero también existen técnicas de weighting basadas en skill scores.
- Para un MVP, la media aritmética es aceptable, pero debe documentarse como decisión de simplificación.

**Sustento actual**: El comentario dice "element-wise ensemble mean" sin justificación de por qué media aritmética.

**Acción requerida**: 
1. Documentar que la media aritmética es la aproximación de MVP.
2. Referenciar que IPCC AR6 usa multi-model mean sin pesos como estándar.
3. Considerar implementar weighting basado en resolución o skill en futuras versiones.

**Estado**: **SIN RESOLVER — Requiere documentación de decisión de MVP**

---

## HALLAZGO-8 [BAJA] — OPENMETEO_FILL = `[null, -999]`

**Archivo**: `pipeline/stages/01-acquisition/adapters/openmeteo.js:26`

```javascript
const OPENMETEO_FILL = new Set([null, -999]);
```

**Problema**: El valor de fill `-999` se considera como dato faltante en el cálculo del promedio del ensemble. No hay documentación de por qué `-999` específicamente.

**Cuestionamiento**: 
- ¿Es `-999` un valor de fill estándar en datos climáticos? (Sí, es común en NetCDF/GRIB).
- ¿Open-Meteo usa `-999` como fill value? (Habría que verificar con la documentación de Open-Meteo).
- ¿Debería ser configurable?

**Sustento actual**: Ninguno. El valor está hardcodeado sin referencia.

**Acción requerida**: 
1. Documentar que `-999` es un fill value estándar en datos climáticos (CF Conventions).
2. Verificar que Open-Meteo efectivamente usa `-999` como fill value.

**Estado**: **SIN RESOLVER — Requiere verificación con documentación de Open-Meteo**

---

## Resumen de Acciones Requeridas

| Hallazgo | Severidad | Acción | Responsable |
|---|---|---|---|
| H-1: País hardcodeado | Crítica | Decidir: geocoding, input param, o validación MVP | Diseño |
| H-2: Nyquist en CMIP6 | Crítica | Justificar o reemplazar con spatial-decorrelation model | Científico |
| H-3: spatial_distance_km | Alta | Definir semántica del campo y justificar valores | Científico + Diseño |
| H-4: Clasificación ENSO | Alta | Decidir: MVP simplificado o regla de 5 trimestres | Científico |
| H-5: Buffer Supabase | Media | Documentar justificación del buffer de 0.5° | Técnico |
| H-6: Rango fechas CMIP6 | Media | Documentar o hacer configurable | Técnico |
| H-7: Media aritmética | Baja | Documentar como decisión de MVP | Técnico |
| H-8: OPENMETEO_FILL | Baja | Verificar fill value con documentación de Open-Meteo | Técnico |

---

## Criterios de Resolución

Un hallazgo se considera resuelto cuando:

1. **Tiene justificación técnica/científica**: La decisión se basa en literatura revisada por pares, estándar de la industria, o criterio lógico documentado.
2. **Está documentado**: La justificación aparece en el código (comentarios), en la configuración, o en documentación de arquitectura.
3. **Es auditable**: Un auditor externo puede seguir la cadena de justificación desde la decisión hasta la fuente.

---

## Referencias

- Trenberth, K.E. (1997). The Definition of El Niño. *Bull. Amer. Meteor. Soc.*, 78, 2771-2777.
- Isaaks, E.H. & Srivastava, R.M. (1989). *An Introduction to Applied Geostatistics*. Oxford University Press.
- IPCC. (2021). Climate Change 2021: The Physical Science Basis. Contribution of Working Group I to the Sixth Assessment Report.
- CF Conventions. (2019). CF Standard Names. http://cfconventions.org/
