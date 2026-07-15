# Stage 06 — Risk Assessment

**Stage ID**: 6 | **Name**: Risk Assessment

## Input Contract

```typescript
{
  stage_05_output: { phenomena: ClimatePhenomenon[] },
  sector: string,
  config: {
    adaptive_capacity_indicators: {
      indicator: string,
      source: string,
      weight: number,
      normalizer: { min: number, max: number }
    }[],
    impact_calculation: {
      sensitivity_by_sector: Record<string, SensitivityProfile>,
      exposure_thresholds: Record<string, number>
    },
    probability_config: {
      external_sources: string[],  // fuentes que proveen probabilidad directa
      internal_thresholds: { signal_strength_to_probability: [number, number][] }
    }
  }
}
```

## Output Contract

```typescript
{
  stage: "risk",
  status: "success",
  assessments: RiskAssessment[],
  exposure: Exposure[],
  adaptive_capacity: {
    score: number,
    indicators: { name: string, value: number, weight: number, contribution: number }[]
  }
}
```

## Behavior

1. **Adaptive Capacity**: calcular desde indicadores configurados (World Bank,
   GRI infraestructura). Cada indicador se normaliza a escala 1-5, se pondera.
2. **Probability**: si existe fuente autoritativa con probabilidad directa
   (e.g., GRI ISIMIP drought probability), usar ese valor mapeado a 1-5.
   Si no, calcular desde signal_strength usando tabla de conversión configurable.
3. **Impact**: calcular desde sensibilidad del sector (profile) × nivel de exposición
   × capacidad adaptativa.
4. **Risk Score**: (P × I) / CA, clasificado según umbrales.
5. **Clasificación**: operativo si se materializa en ≤10 años, estratégico si >10 años.

## Rules Applied

1. CA se calcula con pesos configurables, nunca hardcodeados.
2. Probabilidad externa tiene prioridad sobre cálculo interno.
3. Impacto es siempre cálculo interno (no se hereda de fuente externa).
4. Riesgo catastrófico señalado independientemente del score si cumple criterios
   (vida, legal, continuidad, reputación irreversible).
5. Cada riesgo se evalúa en al menos 2 escenarios (≤2°C y >2°C) y 3 horizontes.

## Traceability

- Desglose completo de CA: qué indicadores, valores, pesos.
- Origen de la probabilidad (externa o interna) con justificación.
- Componentes del impacto: exposición, sensibilidad, CA.
- Fórmula aplicada con valores numéricos.
