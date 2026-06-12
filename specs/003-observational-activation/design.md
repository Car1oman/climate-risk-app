# Design Document: Observational Data Activation

## Layer6 Integration Design

### Current State

```js
// Layer6_NarrativeEngine.js imports
import { buildEnsoNarrative }    from '../services/ensoService.js';
import { buildTerrainNarrative } from '../services/terrainService.js';
import { buildPowerNarrative }   from '../services/nasaPowerService.js';
// MISSING: buildNdviNarrative, buildGraceFoNarrative
```

### Target State

```js
// Layer6_NarrativeEngine.js imports
import { buildEnsoNarrative }      from '../services/ensoService.js';
import { buildTerrainNarrative }   from '../services/terrainService.js';
import { buildPowerNarrative }     from '../services/nasaPowerService.js';
import { buildNdviNarrative }      from '../services/modisNdviService.js';     // NEW
import { buildGraceFoNarrative }   from '../services/graceFoService.js';        // NEW

// In generateNarrative():
const ndviSentence  = buildNdviNarrative(fusedData?.ndviData?.anomaly);
const graceSentence = buildGraceFoNarrative(fusedData?.graceFoData?.anomaly);

const executive_summary = [sentence1, compoundSentence, sentence2,
    ensoSentence, terrainSentence, powerSentence,
    ndviSentence, graceSentence]                              // ADDED
    .filter(Boolean)
    .join(' ');
```

## Layer9 Integration Design

### Current Route (climate.js:835-843)

```js
// Layer 9: buildProjectionContext (IPCC generic)
projectionOutput = buildProjectionContext(signalOutput);
```

### Target Route (climate.js:835-843)

```js
import { runProjectionEngine } from '../layers/Layer9_ProjectionEngine.js';  // NEW

// Layer 9: Projections
const ipccProjections = buildProjectionContext(signalOutput);
const obsProjections  = runProjectionEngine(fusedData);  // NDVI + GRACE-FO

projectionOutput = {
    ...ipccProjections,
    ndvi_projection: obsProjections?.ndvi_projection ?? null,
    grace_fo_projection: obsProjections?.grace_fo_projection ?? null,
};
```

## Financial Ranges Design

```js
FINANCIAL_RANGES: {
    vegetation_stress: {
        retail: { min_usd: 15_000, max_usd: 60_000 },
        agro:   { min_usd: 40_000, max_usd: 150_000 },
        otros:  { min_usd: 10_000, max_usd: 40_000 },
    },
    severe_vegetation_stress: {
        retail: { min_usd: 40_000, max_usd: 150_000 },
        agro:   { min_usd: 100_000, max_usd: 400_000 },
        otros:  { min_usd: 25_000, max_usd: 100_000 },
    },
    groundwater_depletion: {
        retail: { min_usd: 30_000, max_usd: 100_000 },
        agro:   { min_usd: 80_000, max_usd: 300_000 },
        otros:  { min_usd: 20_000, max_usd: 80_000 },
    },
}
```

## Key Design Decisions

1. **Non-breaking narrative**: NDVI/GRACE narratives are appended (not inserted), preserving existing text.
2. **Null-safe**: buildNdviNarrative and buildGraceFoNarrative return '' for null input.
3. **PRECTOT as standalone**: Uses absolute value (mm/day), not delta. Threshold: < 0.5 mm/day.
4. **Layer9 merge**: Not replacement. buildProjectionContext (IPCC reference) + runProjectionEngine (observational projections) coexist.
