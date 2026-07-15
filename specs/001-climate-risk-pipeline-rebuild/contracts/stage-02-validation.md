# Stage 02 — Validation

**Stage ID**: 2 | **Name**: Validation

## Input Contract

```typescript
{
  stage_01_output: StageArtifact,
  config: {
    spatial_distance_thresholds: Record<string, number>,
    fill_values: Record<string, any[]>,
    required_fields: Record<string, string[]>
  }
}
```

## Output Contract

```typescript
{
  stage: "validation",
  status: "success" | "partial",
  validated_sources: ValidatedRecord[],
  coverage_decisions: {
    source: string,
    coverage_status: "available" | "out_of_coverage",
    distance_km: number,
    resolution: string
  }[]
}
```

## Behavior

- Por cada `RawSourceResponse`, ejecutar validaciones según el tipo de fuente:
  1. Schema validation (Zod) — campos requeridos, tipos, rangos
  2. Fill value detection — valores centinela conocidos (-999, 9999, null)
  3. Spatial coverage check — calcular distancia entre coordenadas solicitadas y
     punto real de datos; clasificar según umbral configurado
  4. Temporal freshness — antigüedad del dato vs timestamp de consulta
  5. Completeness — % de campos no nulos

## Rules Applied

1. Schema validation estricto: si faltan campos obligatorios, la fuente se marca
   inválida para esa variable específica.
2. Fill values: detectados y registrados. La variable específica se marca inválida,
   no toda la fuente.
3. Cobertura espacial:
   - Distancia < umbral_1 (configurable por fuente) → "available"
   - Distancia entre umbral_1 y umbral_2 → "available" con penalización
   - Distancia > umbral_2 → "out_of_coverage"
4. Toda fuente marcada "out_of_coverage" se excluye de la normalización pero
   se conserva en el artefacto de evidencia.

## Error Handling

- Fuente con schema inválido: se registra detalle de validación, no se elimina.

## Traceability

- `ValidatedRecord.validation_results[]` — cada regla aplicada con su resultado.
- `coverage_decisions[]` — decisión exacta de cobertura con distancia.
