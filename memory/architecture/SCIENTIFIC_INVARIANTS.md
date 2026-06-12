# SCIENTIFIC INVARIANTS — Reglas Científicas Inmutables

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §7.2  
**Mismo contenido en:** `memory/active/CURRENT_INVARIANTS.md` (resumen operativo)  
**Status:** Especificados; algunos validados en tests existentes, otros pendientes de enforcement explícito

---

## I1 — Confianza acotada por horizonte

```typescript
confidenceBoundedByHorizon: (confidence, horizon) =>
  CONFIDENCE_RANK[confidence] <= CONFIDENCE_RANK[HORIZON_REGISTRY[horizon].allowedMaxConfidence]
```

**end_century** → max `'low'`  
**Open-Meteo proxy** → max `'low'`  
**Temperatura near/mid** → hasta `'high'` (35 modelos, baja varianza)  
**Precipitación near/mid** → max `'low'` (alta varianza inter-modelo)

---

## I2 — end_century siempre con disclaimer visible

```typescript
endCenturyAlwaysDisclaimed: (horizon, hasVisibleDisclaimer) =>
  horizon === 'end_century' ? hasVisibleDisclaimer === true : true
```

Disclaimer texto: "⚠ Extrapolación: Este horizonte no cuenta con datos CMIP6 en la base de datos..."  
**No colapsable.** **No en footer.** Visible en el tab activo.

---

## I3 — ENSO no proyectado en horizontes futuros

```typescript
ensoNotProjected: (hazardId, horizon) => {
  const ensoHazards = ['enso_el_nino', 'enso_la_nina'];
  return ensoHazards.includes(hazardId) ? horizon === 'baseline' : true;
}
```

`enso_modulated_rain` SÍ puede estar en near_term/mid_century (es efecto proyectado, no ENSO en sí).

---

## I4 — Output AI siempre validado antes de UI

```typescript
aiOutputAlwaysValidated: (output, validated) => validated === true
```

Si no pasa validación → `fallbackUsed: true`, usar narrativa del pipeline.  
Nunca retornar texto AI sin validar.

---

## I5 — Precipitación nunca 'high' confidence en proyecciones

```typescript
precipitationConfidenceNotHigh: (variable, confidence, horizon) => {
  if (variable === 'pr' && horizon !== 'baseline') return confidence !== 'high';
  return true;
}
```

**Rationale:** Alta variabilidad inter-modelo CMIP6 para precipitación en Andes. Documentado IPCC AR6.

---

## I6 — Sin valores financieros en narrativa

```typescript
noFinancialValues: (text) =>
  !/\$[\d,.]|S\/\.?\s?[\d,.]|USD\s?[\d,.]/.test(text)
```

Aplica a: buildOperationalNarrative, buildNarrativeReport, output Gemini, textos UI.  
La plataforma es "descriptiva, no prescriptiva" (SCIENTIFIC_METHOD.md:295).

---

## I7 — Histórico y proyectado siempre distinguidos

Las narrativas de proyección incluyen referencia explícita a escenario y horizonte.  
No se puede decir "La temperatura aumentará" sin especificar "bajo SSP2-4.5, horizonte 2040-2059".

---

## I8 — keyMetric trazado a fuente

```typescript
keyMetricTraced: (metric, source) =>
  metric !== null ? source !== null : true
```

Si se muestra un valor numérico, debe tener referencia a la fuente.  
Actualmente: keyMetric solo aparece en ScientificFooter (Sprint 18 lo removió de UI ejecutiva).

---

## Checklist pre-release (de MASTER_REFACTOR_PLAN.md)

- [ ] No hay frases determinísticas sobre el futuro sin qualifier de escenario
- [ ] No hay valores p10/p90 de precipitación con 'high' confidence
- [ ] end_century muestra disclaimer visible
- [ ] Gemini no puede bypasear el validador
- [ ] No hay financial figures en ningún texto
- [ ] ENSO no aparece en horizontes futuros como hazard proyectado
- [ ] Tests de invariantes I1–I8 pasan
- [ ] No hay @ts-nocheck en archivos nuevos o modificados
- [ ] Labels temporales no dicen "corto/mediano/largo plazo"
- [ ] Fuente de datos visible para cada metric en HazardCard

---

## Estado de tests de invariantes

| Invariante | Tests existentes | Enforcement actual |
|-----------|-----------------|-------------------|
| I1 | Parcial (governance tests) | No hay ConfidenceEngine |
| I2 | No | No hay HorizonDisclaimer |
| I3 | No | Detectado en auditoría, no validado |
| I4 | No | scientificValidator.ts no existe |
| I5 | No | No hay ConfidenceEngine |
| I6 | Parcial (narrative tests) | buildOperationalNarrative |
| I7 | Parcial (narrative tests) | buildOperationalNarrative |
| I8 | Parcial (governance tests) | governance.js |
