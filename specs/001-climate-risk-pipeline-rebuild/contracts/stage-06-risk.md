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
4. **Risk Score**: (P × I) / CA — convención de ingeniería de riesgos basada en ISO 31000:2018 §6.6. La fórmula NO es una derivación del marco IPCC AR6 WGII (que define riesgo cualitativamente, §1.4). Ver `thresholds.json` `formula_source` para la referencia completa y análisis comparativo con alternativas.
5. **Clasificación**: operativo si se materializa en ≤10 años, estratégico si >10 años.

## Rules Applied

1. CA se calcula con pesos configurables, nunca hardcodeados.
2. Probabilidad externa tiene prioridad sobre cálculo interno.
3. Impacto es siempre cálculo interno (no se hereda de fuente externa).
4. Riesgo catastrófico señalado independientemente del score si cumple criterios
   (vida, legal, continuidad, reputación irreversible).
5. Cada riesgo se evalúa en al menos 2 escenarios (≤2°C y >2°C) y 3 horizontes.
   **H-6.10 (documentacion-v2/stage-06, ALTO): NO implementado — brecha estructural, no un descuido de Stage 6.**
   Stage06Risk produce 1 evaluación por fenómeno recibido (su loop escala correctamente a N si Stage 05
   emitiera N fenómenos distintos por hazard). El bloqueo real está aguas arriba: (a) ninguna fuente de
   datos del pipeline tiene dimensión de escenario SSP — Open-Meteo CMIP6, única fuente de proyecciones,
   expone solo el ensemble HighResMIP (~RCP8.5) sin parámetro de escenario (HALLAZGO-8,
   `authoritative-sources.json` `projection_climate`); (b) Stage 05 colapsa deliberadamente los horizontes
   corto/mediano/largo de un fenómeno en uno solo por prioridad (H-5.9), no emite 3 fenómenos independientes.
   Fabricar 6 assessments por fenómeno duplicando el mismo P/I/CA con solo la etiqueta de
   escenario/horizonte distinta simularía una granularidad de análisis que no existe en los datos. En su
   lugar, cada assessment declara explícitamente su cobertura real vs. la exigida aquí en el campo
   `evaluation_coverage` (`meets_contract: false` hoy) — ver `thresholds.json`
   `evaluation_coverage_requirements` y Stage06Risk `rulesApplied` H-6.10. Cerrar esta brecha requiere
   trabajo en Stage 03 (ingesta de SSPs) y Stage 05 (dejar de colapsar horizontes), fuera del alcance de
   Stage 6.

## Traceability

- Desglose completo de CA: qué indicadores, valores, pesos.
- Origen de la probabilidad (externa o interna) con justificación.
- Componentes del impacto: exposición, sensibilidad, CA.
- Fórmula aplicada con valores numéricos.
