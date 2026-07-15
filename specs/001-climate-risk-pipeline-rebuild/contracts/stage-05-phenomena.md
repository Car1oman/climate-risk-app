# Stage 05 — Phenomena Consolidation

**Stage ID**: 5 | **Name**: Phenomena Consolidation

## Input Contract

```typescript
{
  stage_04_output: { signals: ClimateSignal[] },
  config: {
    phenomenon_definitions: {
      name: string,
      required_signals: string[],    // señales que deben estar presentes
      optional_signals: string[],     // señales que refuerzan
      min_confidence: number          // source_quality mínimo combinado
    }[],
    confidence_combination: "min" | "weighted" | "geometric_mean"
  }
}
```

## Output Contract

```typescript
{
  stage: "phenomena",
  status: "success",
  phenomena: ClimatePhenomenon[],
  phenomena_not_detected: { name: string, reason: string, evidence: string }[]
}
```

## Behavior

1. Para cada definición de fenómeno en configuración, verificar si las señales
   requeridas están presentes y activas.
2. Si un fenómeno requiere señal X y no está presente → "not_detected".
3. Si las señales requeridas existen, combinar sus confianzas.
4. Asignar nivel de confianza combinado.
5. Clasificar horizonte temporal según las señales que lo componen.

## Rules Applied

1. Un fenómeno necesita al menos una señal requerida activa para ser considerado.
2. La confianza combinada usa el método configurado (default: geometric_mean).
3. Fenómenos no detectados se registran con evidencia negativa (qué señal faltó).
4. Un mismo fenómeno puede tener señales de diferentes horizontes (e.g.,
   ENSO activo ahora + calentamiento proyectado a 2050).

## Traceability

- Cada fenómeno referencia sus señales contribuyentes.
- Fenómenos no detectados tienen evidencia explícita de por qué no se activaron.
- `confidence.combined` nunca reemplaza los componentes source_quality y
  signal_strength originales.
