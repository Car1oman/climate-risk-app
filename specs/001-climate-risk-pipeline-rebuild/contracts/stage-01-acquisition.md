# Stage 01 — Acquisition

**Stage ID**: 1 | **Name**: Acquisition

## Input Contract

```typescript
{
  coordinates: { lat: number, lon: number },
  sector: string,
  timestamp: datetime
}
```

## Output Contract

```typescript
{
  stage: "acquisition",
  status: "success" | "partial",
  sources_consulted: RawSourceResponse[],
  summary: {
    total: number,
    successful: number,
    failed: number,
    out_of_coverage: number,
    sum_of_durations_ms: number
  }
}
```

## Behavior

- Consultar todas las fuentes del registro en paralelo, pero con manejo
  individual de errores (no Promise.allSettled sin seguimiento).
- Cada fuente tiene su propio adapter con:
  - Endpoint y parámetros específicos
  - Timeout configurable
  - Parseo de respuesta (o captura de error estructurado)
- El registro de fuentes autoritativas se lee de `pipeline/config/authoritative-sources.json`.

## Rules Applied

1. Cada fuente se consulta con timeout individual (default 30s).
2. Si una fuente falla (timeout, 500, red), se registra el error y se continúa.
3. La respuesta cruda se conserva COMPLETA en `raw_response`.
4. No hay transformación de datos en esta etapa — solo adquisición.

## Error Handling

- Error por fuente: capturado y registrado en `RawSourceResponse.error`.
- No hay error global del stage (continúa con fuentes disponibles).

## Traceability

- `RawSourceResponse` contiene endpoint exacto, timestamp, status code,
  duración, y body crudo. Esto permite reproducir la consulta exacta.
