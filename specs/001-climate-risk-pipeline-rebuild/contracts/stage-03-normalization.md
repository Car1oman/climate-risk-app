# Stage 03 — Normalization

**Stage ID**: 3 | **Name**: Normalization

## Input Contract

```typescript
{
  stage_02_output: { validated_sources: ValidatedRecord[] },
  config: {
    authoritative_sources: Record<string, string>,  // dominio → fuente
    canonical_variables: Record<string, CanonicalVariableDef>
  }
}
```

## Output Contract

```typescript
{
  stage: "normalization",
  status: "success" | "partial",
  canonical_variables: CanonicalVariable[],
  source_decisions: {
    variable: string,
    primary_source: string,
    complementary_sources: string[],
    discarded_sources: { source: string, reason: string }[]
  }[]
}
```

## Behavior

1. Para cada dominio, identificar la fuente autoritativa del registro.
2. Extraer la variable canónica de la respuesta de la fuente autoritativa.
3. Para cada variable, registrar qué fuentes complementarias también la proveen.
4. Descartar duplicados (fuentes no autoritativas para variables ya cubiertas).
5. Normalizar unidades al estándar del sistema.

## Rules Applied

1. Una fuente autoritativa por dominio. No hay fusión automática.
2. Si la fuente autoritativa no tiene datos para una coordenada, se registra
   "sin cobertura" y NO se usa una fuente complementaria como reemplazo automático.
3. Fuentes complementarias se conservan en `complementary_sources` para trazabilidad.
4. Conversión de unidades es explícita y registrada (C→F, mm→m, etc.).
5. Cambio de nombre de variable (e.g., "T2M" → "air_temperature_daily_mean")
   es explícito con mapeo uno a uno.

## Error Handling

- Variable sin fuente autoritativa disponible: se excluye del resultado,
  se registra en trazabilidad como "no disponible".
- Variable con datos parciales (algunos días válidos, otros no): se incluyen
  solo los válidos, los inválidos se marcan como null con razón.

## Traceability

- `source_decisions[]` — por cada variable canónica, qué fuente se usó y por qué.
- Variables descartadas con razón explícita.
- Mapeo completo de nombre original → nombre canónico.
