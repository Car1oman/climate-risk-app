# CURRENT INVARIANTS — Operativos del Sprint

**Fuente completa:** `memory/architecture/SCIENTIFIC_INVARIANTS.md` (única source of truth)
**Regla:** Ninguna implementación puede violar I1-I8. Ver SCIENTIFIC_INVARIANTS.md para especificación completa.

---

## Invariantes activos en este sprint (P0)

| # | Riesgo si se rompe | Aplica a |
|---|-------------------|----------|
| I4 | Output AI sin validación → alucinaciones climáticas | ✅ YA CUBIERTO (system prompt + validator en ai.js) |
| I6 | Valores financieros en narrativa → responsabilidad legal | `buildOperationalNarrative`, `buildNarrativeReport`, output Gemini |
| I7 | Mezclar lenguaje histórico/proyectado → confusión científica | `buildOperationalNarrative.ts` |

## Invariantes que NO aplican en P0 (sin cambios en modelo semántico)

| # | Razón |
|---|-------|
| I1 | Requiere `HORIZON_REGISTRY` + `ConfidenceEngine` → P1 |
| I2 | Requiere `HorizonDisclaimer` component → P1.5 |
| I3 | Requiere `HazardClassifier` + `HAZARD_REGISTRY` → P2 |
| I5 | Requiere `ConfidenceEngine` en Layer 3 → P1 |
| I8 | keyMetric solo en ScientificFooter, no cambia en P0 |

## Quick enforcement checks (P0)

```typescript
// I6: Sin valores financieros en narrativa
const noFinancialValues = (text: string) =>
  !/\$[\d,.]|S\/\.?\s?[\d,.]|USD\s?[\d,.]/.test(text)

// I7: Histórico vs proyectado distinguidos
const hasHorizonRef = (text: string, horizon: string) =>
  text.includes(horizon) // verificar referencia explícita
```

## Checklist P0

- [ ] I4: Gemini output pasa por validateAIOutput() (✅ ya implementado)
- [ ] I6: No hay $/S/./USD en ninguna narrativa nueva
- [ ] I7: near_term narrative dice "Horizonte 2020–2039", no "próxima década"
- [ ] build verde
- [ ] 770+ tests PASS
