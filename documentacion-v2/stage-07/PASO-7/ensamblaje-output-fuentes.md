# PASO-7 — Ensamblaje de Output y Fuentes

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `execute()` (ensamblaje final), `getSourcesUsed()`, `getSourcesOutOfCoverage()`, `getSignalDetail()`, `mapSourceSummary()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:127-218, 584-675` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del ensamblaje final del output (executive vs. analyst), el proyectado de fuentes y señales, y el mapper compartido |

---

## 1. Resumen Ejecutivo

El PASO-7 ensambla el output final: la vista executive retorna solo `base` (PASO-1 a PASO-6), mientras la vista analyst extiende `base` con fuentes consultadas, fuentes fuera de cobertura, detalle de señales, cálculos de riesgo paso a paso, y riesgos de transición. getSourcesUsed/getSourcesOutOfCoverage son complementarios (partición completa de sources_consulted), y getSignalDetail cruza signals con phenomena vía contributing_signals.

---

## 2. Ensamblaje en execute()

```javascript
// Después de calcular base (PASO-1 a PASO-6):
if (view === "analyst") {
  return {
    view: "analyst",
    response: {
      ...base,
      sources_used: this.getSourcesUsed(input),
      sources_out_of_coverage: this.getSourcesOutOfCoverage(input),
      signal_detail: this.getSignalDetail(input, phenomena),
      risk_calculation: assessments.map(a => ({
        phenomenon_id: a.phenomenon_id,
        risk_score_raw: a.risk_score_raw,
        probability: a.probability,
        impact: a.impact,
        adaptive_capacity: a.adaptive_capacity,
      })),
      transition_risks: (transitionRisks || []).map(r => ({
        type: r.type,
        description: r.description,
        severity: r.severity,
        timeframe: r.timeframe,
        signal_strength: r.signal_strength,
      })),
    },
  };
}
return { view: "executive", response: base };
```

---

## 3. getSourcesUsed() (H-7.10)

```javascript
getSourcesUsed(input) {
  const sources = input.sources_consulted || [];
  return sources.filter(s => s.coverage_status === "available").map(s => this.mapSourceSummary(s));
}
```

**Criterio**: `coverage_status === "available"` — el piso operativo de calidad ya citado en thresholds.json signal_activation._refs.min_source_quality (ISO/IEC 25012:2008 §6.1).

**NO existe una categoría 'partial' que se esté ocultando**: CoverageStatusEnum declara 5 valores, pero los adapters de Stage 1 solo emiten 3 (available/out_of_coverage/failed). Los valores "partial" y "unknown" son exclusivos de Stage02/Stage03, calculados sobre validated_sources — un array distinto que Stage 7 no consume.

---

## 4. getSourcesOutOfCoverage() (H-7.8)

```javascript
getSourcesOutOfCoverage(input) {
  const sources = input.sources_consulted || [];
  return sources
    .filter(s => s.coverage_status !== "available")
    .map(s => ({
      ...this.mapSourceSummary(s),
      reason:
        s.error ??
        (s.spatial_distance_km != null
          ? `Distancia espacial (${s.spatial_distance_km}km) excede el máximo de representatividad.`
          : "Sin datos disponibles para esta ubicación en esta fuente."),
    }));
}
```

**Complemento exacto** de getSourcesUsed() sobre la MISMA input.sources_consulted. Juntos cubren TODO el array — nada se oculta.

**Reason**: Cita `source.error` cuando existe (siempre para "failed"); para "out_of_coverage" construye una razón legible desde spatial_distance_km o un texto genérico honesto. Nunca inventa una razón más específica que la que el dato soporta.

---

## 5. getSignalDetail() (H-7.8)

```javascript
getSignalDetail(input, phenomena) {
  const signals = input.signals || [];
  return signals.map(s => ({
    signal_id: s.signal_id,
    name: s.name,
    type: s.type,
    source_quality: s.source_quality?.score ?? null,
    signal_strength: s.signal_strength?.score ?? null,
    contributing_to: (phenomena || [])
      .filter(p => (p.contributing_signals || []).includes(s.signal_id))
      .map(p => p.name),
  }));
}
```

**Campos expuestos**: Los 2 campos que el contrato (Behavior §2: "Señales con source_quality y signal_strength") pide y que Stage 7 nunca leyó. Más signal_id, name, type para identificación.

**contributing_to**: Cruza phenomenon.contributing_signals (Stage 5) — dato derivado, no fabricado.

**LÍMITE DECLARADO**: signals_discarded (Stage 4, señales que NO pasaron min_signal_strength) no se incluye — Stage05Phenomena.execute() no reenvía esa clave, así que no sobrevive el aplanado hasta Stage 7.

---

## 6. mapSourceSummary() (H-7.10)

```javascript
mapSourceSummary(s) {
  return {
    name: s.source_name,
    domain: s.source_domain,
    status: s.coverage_status,
    authority_level: s.authority_level ?? null,
    spatial_distance_km: s.spatial_distance_km ?? null,
    resolution_native: s.resolution_native ?? null,
    duration_ms: s.duration_ms ?? null,
  };
}
```

**Mapper compartido** por getSourcesUsed() y getSourcesOutOfCoverage() — antes cada uno construía su propio objeto, con riesgo de divergencia.

**NO se agregan** coverage_percentage/last_updated/reliability_score (sugeridos en la auditoría): ningún stage de este pipeline calcula esos 3 valores. Se exponen los 4 campos reales que sí existen.

---

## 7. Vista Executive vs. Analyst

| Campo | Executive | Analyst |
|-------|:---------:|:-------:|
| location | Sí | Sí |
| overall_risk (level, composite, count) | Sí | Sí |
| phenomena (name, status, risk_contribution) | Sí | Sí |
| recommendations | Sí | Sí |
| executive_summary | Sí | Sí |
| confidence_note | Sí | Sí |
| trace_id | Sí | Sí |
| sources_used | No | Sí |
| sources_out_of_coverage | No | Sí |
| signal_detail | No | Sí |
| risk_calculation | No | Sí |
| transition_risks | No | Sí |

---

## 8. Datos Disponibles pero No Incluidos

| Dato | Por qué no está | Requisito para incluirlo |
|------|-----------------|--------------------------|
| signals_discarded (Stage 4) | Stage 5 no lo reenvía | Cambio en Stage 5 |
| coverage_percentage por fuente | Ningún stage lo calcula | Nuevo cálculo en Stage 1/2 |
| last_updated por fuente | Ningún stage lo produce | Nuevo campo en adapters |
| reliability_score agregado | Ningún stage lo produce | Nuevo cálculo en Stage 2 |
| Correlación entre fenómenos | Ningún stage produce covarianza | Nuevo cálculo en Stage 5 |

---

## 9. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.8 (MEDIO): sources_out_of_coverage y signal_detail siempre vacíos | getSourcesOutOfCoverage() y getSignalDetail() implementados |
| H-7.10 (BAJO): getSourcesUsed() sin campos de calidad | mapSourceSummary() con authority_level, spatial_distance_km, resolution_native, duration_ms |
| H-7.10 (BAJO): criterio binario sin documentar | ISO/IEC 25012:2008 §6.1 como fundamento |
| H-7.10 (BAJO): mapper duplicado entre métodos | mapSourceSummary() como mapper único compartido |
| H-7.8 (MEDIO): signals_discarded no incluido | Límite declarado (Stage 5 no lo reenvía) |
