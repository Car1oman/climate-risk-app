# FRONTEND CONTRACTS — Props API para Componentes UI

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §7.3  
**Status:** Contratos objetivo definidos; implementación en los 3 componentes principales sin TypeScript (P0.4)

---

## Reglas absolutas para componentes UI

1. **No `@ts-nocheck`** en ningún archivo (actual: ClimateRiskLookup.jsx, RiskPeriodTabs.jsx, ExecutiveSummaryCard.jsx los tienen — P0.4)
2. **No reciben `any`, `object`, o `Record<string, unknown>`** como props
3. **No importan desde `server/`**
4. **No tienen lógica de negocio** — solo display
5. **No hacen transformación de datos** — reciben display data lista para renderizar
6. **Props tipados = display data**, no raw API responses

---

## Componentes actuales (estado real)

| Componente | Archivo | Estado TypeScript |
|-----------|---------|-------------------|
| ClimateRiskLookup | `src/features/climate-lookup/ClimateRiskLookup.jsx` | @ts-nocheck |
| RiskPeriodTabs | `src/features/climate-lookup/components/RiskPeriodTabs.jsx` | @ts-nocheck |
| ExecutiveSummaryCard | `src/features/climate-lookup/components/ExecutiveSummaryCard.jsx` | @ts-nocheck |
| ConsolidatedRiskCard | `src/features/climate-lookup/components/ConsolidatedRiskCard.jsx` | OK |
| AdaptationPanel | `src/features/climate-lookup/components/AdaptationPanel.jsx` | OK |
| RiskTimeline | `src/features/climate-lookup/components/RiskTimeline.jsx` | OK |
| ScientificFooter | `src/features/climate-lookup/components/ScientificFooter.jsx` | OK |

---

## Jerarquía de componentes actual (Sprint 22)

```
ClimateRiskLookup (orquestador)
  ├── ExecutiveSummaryCard      ← Hero: resumen + riesgos principales
  ├── RiskPeriodTabs            ← Tabs: historico | mediano_plazo | largo_plazo (falta near_term)
  │   └── RiskPeriodSection     ← Content por período con ScenarioToggle
  ├── RiskTimeline              ← Visual histórico→2050→2070
  ├── AdaptationPanel           ← Medidas de adaptación
  └── ScientificFooter          ← Colapsado: fuentes + metodología
```

---

## Contratos objetivo post-refactor (P1+)

### HazardCardProps (target)
```typescript
interface HazardCardProps {
  displayType: RiskDisplayType;
  displayName: string;
  icon: string;
  horizon: ClimateHorizon;
  horizonLabel: string;          // "Horizonte 2040–2059"
  intensity: 'low' | 'moderate' | 'high' | 'very_high';
  confidence: ConfidenceLevel;
  confidenceLabel: string;       // "Alta confianza (temperatura)"
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  keyMetric: string | null;      // solo en ScientificFooter
  narrativeText: string;
  impactBullets: string[];
  adaptationMeasures: AdaptationSummary[];
  disclaimer: string | null;     // visible si horizon === 'end_century'
}
```

### ExecutiveSummaryCardProps (target)
```typescript
interface ExecutiveSummaryCardProps {
  locationLabel: string;
  executiveSummary: string;
  primaryHazards: Array<{ displayType: RiskDisplayType; displayName: string; icon: string }>;
  confidence: ConfidenceLevel;
  scenarioDelta: string | null;
  analysisDate: string;
}
```

### HorizonNavigatorProps (target — reemplaza RiskPeriodTabs)
```typescript
interface HorizonNavigatorProps {
  availableHorizons: ClimateHorizon[];
  activeHorizon: ClimateHorizon;
  onHorizonChange: (h: ClimateHorizon) => void;
  activeScenario: 'ssp245' | 'ssp585';
  onScenarioChange: (s: 'ssp245' | 'ssp585') => void;
}
```

---

## Bug activo: near_term invisible en UI (P0.6)

```
// RiskPeriodTabs.jsx:5-9 — PERIOD_TABS hardcodeado con 3 entradas
const PERIOD_TABS = [
  { id: 'historico', label: 'Histórico' },
  { id: 'mediano_plazo', label: 'Mediano Plazo' },
  { id: 'largo_plazo', label: 'Largo Plazo' },
  // FALTA: { id: 'corto_plazo', label: 'Horizonte 2020-2039' }
];

// ClimateRiskLookup.jsx:113-124 — Solo 3 arrays filtrados, sin slot para corto_plazo
// ExecutiveSummaryCard.jsx:11-15 — PERIOD_NARRATIVE_KEY sin entrada para corto_plazo

// Fix P0.6: agregar corto_plazo a las 3 ubicaciones
// Los datos YA existen — normalizeRisks() ya produce period: 'corto_plazo'
```

---

## Estado del hook de datos

`useClimateAnalysis.js` — diseño correcto, no modificar interfaz pública:
- fetch + normalización + narrativa + Layer9
- `consolidatedRisks`, `timelineRisks`, `narrativeReport` como outputs
- `selectedPeriod` elevado a `ClimateRiskLookup` (Sprint 22)
- `groupByRiskType()` exportada y tipada
