# PASO-4 — Inferencia de Metadatos

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `inferStatus()`, `inferHorizon()`, `inferScenario()`, `SIGNAL_METADATA` |
| **Ubicación** | `pipeline/stages/05-phenomena/signal-metadata.js` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la inferencia de status, horizonte temporal y escenario de un fenómeno desde las señales que lo componen |

---

## 1. Resumen Ejecutivo

PASO-4 infiere tres metadatos del fenómeno desde las señales contribuyentes: (1) status (active/projected/not_detected), (2) horizon temporal (corto/mediano/largo/null), y (3) scenario (hoy siempre null). Antes de la corrección H-5.9/H-5.11, estos campos se hardcodeaban (status="active" o "not_detected", horizon=null, scenario=null).

---

## 2. SIGNAL_METADATA

Mapping estático de nombre de señal → {type, horizon, scenario}. Derivado de `signal-taxonomy.json` (variable → signal_name + signal_type) y convenciones de nombrado (sufijos _corto/_mediano/_largo).

```javascript
export const SIGNAL_METADATA = {
  // Anomaly (observación actual) — corto, sin scenario
  temperatura_actual_anomaly:   { type: "anomaly", horizon: "corto", scenario: null },
  humidity_anomaly:             { type: "anomaly", horizon: "corto", scenario: null },
  wind_anomaly:                 { type: "anomaly", horizon: "corto", scenario: null },
  // ... más señales anomaly ...

  // Proyecciones CMIP6 — HighResMIP, sin escenario SSP (HALLAZGO-8)
  temperatura_max_projection:        { type: "projected", horizon: "corto", scenario: null },
  temperatura_max_projection_mediano:{ type: "projected", horizon: "mediano", scenario: null },
  temperatura_max_projection_largo:  { type: "projected", horizon: "largo", scenario: null },
  // ... más proyecciones ...

  // Categóricas (ENSO) — sin horizonte, sin scenario
  enso_phase_categorical: { type: "categorical", horizon: null, scenario: null },
};
```

**Diseño**: El mapping es estático y acotado — solo incluye señales que aparecen en `phenomenon-definitions.json`. No necesita ser exhaustivo para todas las variables canónicas.

---

## 3. inferStatus(signalNames)

**H-5.9**: Infiera el status del fenómeno desde los tipos de sus señales contribuyentes.

```javascript
export function inferStatus(signalNames) {
  const types = signalNames.map(name => SIGNAL_METADATA[name]?.type).filter(t => t != null);
  if (types.length === 0) return "active";
  const hasObserved = types.some(t => t === "anomaly" || t === "categorical");
  if (hasObserved) return "active";
  return "projected";
}
```

**Reglas**:

| Condición | Status | Justificación |
|-----------|--------|---------------|
| Alguna señal es "anomaly" o "categorical" | `active` | El fenómeno tiene evidencia observada/actual |
| Todas las señales son "projected" | `projected` | El fenómeno es exclusivamente futuro |
| No se conocen los tipos | `active` | Fallback conservador |

**Implicación**: Un fenómeno con `temperatura_actual_anomaly` (anomaly) Y `temperatura_max_projection_largo` (projected) recibe status="active" porque tiene base observada actual, aunque también tenga evidencia futura.

---

## 4. inferHorizon(signalNames)

**H-5.9**: Infiera el horizonte temporal más significativo del fenómeno.

```javascript
export function inferHorizon(signalNames) {
  const horizons = signalNames.map(name => SIGNAL_METADATA[name]?.horizon).filter(h => h != null);
  if (horizons.length === 0) return null;
  if (horizons.includes("largo")) return "largo";
  if (horizons.includes("mediano")) return "mediano";
  return "corto";
}
```

**Reglas de prioridad**: largo > mediano > corto (el horizonte más lejano gana).

**Razón**: Si un fenómeno tiene evidencia de largo plazo (2060-2079), eso es más significativo para la planificación que la evidencia de corto plazo. Un fenómeno que amenaza en 30 años requiere diferentes medidas de adaptación que uno inminente.

| Condición | Horizon |
|-----------|---------|
| Alguna señal con horizon="largo" | `"largo"` |
| Alguna señal con horizon="mediano" (sin largo) | `"mediano"` |
| Solo señales con horizon="corto" | `"corto"` |
| Todas las señales con horizon=null (categóricas) | `null` |

---

## 5. inferScenario(signalNames)

**H-5.11**: Infiera el escenario climático del fenómeno.

```javascript
export function inferScenario(signalNames) {
  for (const name of signalNames) {
    const scenario = SIGNAL_METADATA[name]?.scenario;
    if (scenario != null) return scenario;
  }
  return null;
}
```

**Estado actual**: Retorna `null` para todas las señales porque:
1. Señales anomaly son observaciones actuales — no aplica escenario.
2. Señales projected provienen de Open-Meteo CMIP6 HighResMIP ensemble (HALLAZGO-8) — pathway alto sin parámetro SSP.
3. Señales categóricas (ENSO) son estados discretos — no aplica escenario.

**Stage 6 usa fallback**: `phenomenon.scenario || "not_scenario_specific"` (stage-06-risk.js:59), correcto y consistente con HALLAZGO-8.

**Extensión futura**: Para poblar scenario, se necesita (a) agregar campo scenario a ClimateSignalSchema, (b) extraer etiquetas SSP de fuentes que las provean, (c) actualizar SIGNAL_METADATA e inferScenario().

---

## 6. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.9 (MEDIO): Status solo active/not_detected | inferStatus() infiere active/projected desde tipos de señales |
| H-5.11 (MEDIO): scenario y horizon siempre null | inferHorizon() y inferScenario() en signal-metadata.js |
