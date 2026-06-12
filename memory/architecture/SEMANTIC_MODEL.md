# SEMANTIC MODEL — Modelo Semántico del Sistema

**Propósito:** Vocabulario canónico. Define qué significa cada término en el sistema y cómo se relacionan.

---

## Entidades Core

### ConsolidatedRisk (actual — Sprint 14+)
Entidad central de la UI. Resultado de normalizar y deduplicar `signals[] + risks[] + gri_hazards[]`.

```typescript
// src/types/consolidatedRisk.ts
interface ConsolidatedRisk {
  riskType: RiskTypeSlug;     // legacy: 'calor_extremo' | 'lluvias_extremas' | etc.
  period: TemporalPeriod;     // legacy: 'historico' | 'corto_plazo' | 'mediano_plazo' | 'largo_plazo'
  scenario: string;           // 'ssp245' | 'ssp585'
  // + impactos, adaptaciones, narrativa, confianza...
  scenarioVariants: { ssp245: ..., ssp585: ... };  // Sprint 19
}

// Deduplicación: por (riskType × period) — una tarjeta por combinación
```

### ConsolidatedRiskTimeline (actual — Sprint 21)
Vista agrupada por `riskType` con todos los períodos.

```typescript
interface ConsolidatedRiskTimeline {
  riskType: RiskTypeSlug;
  periods: Record<TemporalPeriod, ConsolidatedRisk | null>;
  // evolución temporal completa de un tipo de riesgo
}
```

### NarrativeReport (actual — Sprint 15+)
```typescript
interface NarrativeReport {
  executiveSummary: string;
  historicalNarrative: string;
  midTermNarrative: string;
  longTermNarrative: string;
  // generado por buildNarrativeReport.ts
}
```

---

## Mapeo de naming canónico

| Concepto | Key backend legacy | Key TypeScript nueva | Label UI |
|----------|-------------------|---------------------|---------|
| Obs. 1981-2014 | `historical` | `baseline` | "Línea Base 1981–2014" |
| Proyección 2020-2039 | `near_term` / `corto` | `near_term` | "Horizonte 2020–2039" |
| Proyección 2040-2059 | `mid_term` / `mediano` | `mid_century` | "Horizonte 2040–2059" |
| Proyección 2060-2079 | `long_term` | `end_century` | "Horizonte 2060–2079 ⚠" |
| SSP2-4.5 | `ssp245` | `ssp245` | "Emisiones moderadas" |
| SSP5-8.5 | `ssp585` | `ssp585` | "Altas emisiones" |
| Calor extremo | `calor_extremo` | `heat_stress` | "Estrés por Calor" |
| Lluvia extrema | `lluvias_extremas` | `extreme_precipitation` | "Precipitación Extrema" |
| Inundación | `inundacion` | `flooding` | "Inundación" |
| Deslizamiento | `deslizamiento` | `mass_movement` | "Deslizamiento" |
| Sequía | `sequia` | `drought` | "Sequía" |
| Heladas | `heladas` | `frost` | "Heladas" |
| ENSO | `fenomeno_enso` | `enso_variability` | "Variabilidad ENSO" |

---

## Flujo de datos actual (Sprint 22)

```
API response (signals[], risks[], gri_hazards[], projections, narrative, territorial)
    ↓
normalizeRisks()  [src/utils/normalizeRisks.ts]
    ↓ deduplicación por (riskType × period)
ConsolidatedRisk[]  [src/types/consolidatedRisk.ts]
    ↓
groupByRiskType()  [src/utils/normalizeRisks.ts]
    ↓
ConsolidatedRiskTimeline[]
    ↓
useClimateAnalysis.js  (hook orquestador)
    ↓ {consolidatedRisks, timelineRisks, narrativeReport, selectedPeriod}
ClimateRiskLookup.jsx  (orquestador UI)
    ↓ props tipadas
ExecutiveSummaryCard | RiskPeriodTabs | RiskTimeline | AdaptationPanel | ScientificFooter
```

---

## Constantes semánticas activas

```
src/constants/riskTypes.ts    → RISK_TYPE_DISPLAY (icon, label, color por riskType)
src/constants/scenarios.ts    → SCENARIO_DISPLAY, TIME_WINDOWS_UI
src/constants/metrics.ts      → METRIC_DISPLAY (unidades, labels)
```

---

## Términos prohibidos en el sistema

| Prohibido | Reemplazar por |
|-----------|---------------|
| "corto plazo" | "Horizonte 2020–2039" |
| "próxima década" | "Horizonte 2020–2039 (período parcialmente transcurrido)" |
| "largo plazo" | "Horizonte 2060–2079" |
| "causará" | "podría aumentar la probabilidad de" |
| "riesgo crítico" (sin datos) | "alta confianza de incremento" |
| Valores $, S/., USD + número | (no usar en narrativa) |
| Códigos SSP raw ("SSP2-4.5") | "emisiones moderadas" |
