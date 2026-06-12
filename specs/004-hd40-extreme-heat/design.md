# Design Document: hd40 + Extreme Heat Signal Expansion

## Signal Hierarchy

To avoid duplicate signals from multiple heat indicators, define a priority chain:

```
severe_heat (hd40) → extreme_heat (hd35/tasmax/tx84rr) → moderate_heat (hd30)
```

Rule: If a higher-priority signal is generated for the same horizon, suppress lower-priority duplicates.

## Threshold Details

```
signalThresholds.js additions:

severe_heat_delta: {
  costa:  5,    // +5 days Tmax > 40°C vs historical
  sierra: 0,    // No aplica (Tmax rara vez > 40°C en sierra)
  selva:  2,    // +2 days
  puna:   0,    // No aplica
  default: 3,
}

moderate_heat_delta: {
  costa:  20,
  sierra: 15,
  selva:  25,
  puna:   10,
  default: 15,
}

r20mm_delta: {
  costa:  5,
  sierra: 3,
  selva:  10,
  puna:   3,
  default: 5,
}
```

## Layer2 Detection Logic

```js
// Deduplication: track generated signal types per horizon
const generatedHeatTypes = new Set();

function addDeduplicated(signal) {
    const key = `${signal.signalType}:${signal.horizon}`;
    if (generatedHeatTypes.has(key)) return;
    generatedHeatTypes.add(key);
    signals.push(signal);
}

// severe_heat (hd40) — highest priority
if (hist?.hd40 != null && period?.hd40 != null) {
    const d = deltaAbs(hist.hd40, period.hd40);
    if (d != null && d > thr.severe_heat_delta) {
        addDeduplicated(buildSignal({ signalType: 'severe_heat', ... }));
    }
}

// moderate_heat (hd30) — only if no severe_heat
if (hist?.hd30 != null && period?.hd30 != null) {
    const d = deltaAbs(hist.hd30, period.hd30);
    const hasSevere = signals.some(s =>
        (s.signalType === 'severe_heat' || s.signalType === 'extreme_heat')
        && s.horizon === horizon
    );
    if (!hasSevere && d != null && d > thr.moderate_heat_delta) {
        addDeduplicated(buildSignal({ signalType: 'moderate_heat', ... }));
    }
}
```

## Response Changes

New signal types in response:
- `severe_heat` (hd40) — Tmax > 40°C
- `moderate_heat` (hd30) — Tmax > 30°C
- Existing `extreme_heat` (hd35/tasmax/tx84rr) unchanged

## Ordering in Signal Output

1. severe_heat (if present)
2. extreme_heat
3. moderate_heat (if no severe_heat or extreme_heat for same horizon)
