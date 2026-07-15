# Quickstart — Validation Guide

**Date**: 2026-06-22 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Prerequisites

- Node.js v22+
- Acceso a APIs externas (WeatherAPI, NASA POWER, Open-Meteo, etc.)
- Supabase project configurado (opcional para artefactos)

## Validation Scenarios

### Scenario 1: Ricardo Palma — Complete Pipeline

**Purpose**: Validar el pipeline completo con datos reales. Debe demostrar
cobertura parcial, fuente fuera de cobertura, señales ENSO, y narrativa ejecutiva.

**Setup**: Consultar `(-11.8996, -76.67358)` con sector `general`.

**Expected outcomes**:
- 11 fuentes consultadas, ≥10 exitosas
- `climate_cells` marcado como "out_of_coverage" (distancia 5.85°)
- ENSO signal detectada (ONI +0.48°C, El Niño advisory)
- Señal de calentamiento proyectado (SSP5-8.5 Δ+1.36°C)
- Risk score calculado con (P × I) / CA
- Artefacto de evidencia generado con trazabilidad completa
- UI ejecutiva sin nombres técnicos
- UI analista con desglose de confianza

**Command** (cuando exista el endpoint):
```
POST /api/v2/climate-risk
{ "lat": -11.8996, "lon": -76.67358, "sector": "general" }
```

### Scenario 2: Complete Coverage Location

**Purpose**: Validar comportamiento con cobertura total de fuentes.

**Setup**: Consultar coordenadas en el rango de `climate_cells` (< -17.75°S).

**Expected outcomes**:
- Las 11 fuentes disponibles (climate_cells incluida)
- Mayor source_quality por cobertura espacial completa
- Posible interpolación en proyecciones si hay múltiples celdas vecinas

### Scenario 3: Oceanic Coordinates (No Coverage)

**Purpose**: Validar comportamiento con 0 fuentes disponibles.

**Setup**: Consultar coordenadas oceánicas (e.g., `(-30, -90)`).

**Expected outcomes**:
- Todas las fuentes terrestres marcan "out_of_coverage"
- Pipeline completa con resultado vacío
- No se generan valores sintéticos
- Artefacto registra "sin cobertura" para cada fuente
- UI muestra "No hay datos para esta ubicación"

### Scenario 4: Partial Source Failure

**Purpose**: Validar comportamiento cuando una fuente falla.

**Setup**: Configurar un adapter para que devuelva timeout.

**Expected outcomes**:
- Pipeline continúa con fuentes restantes
- La fuente fallida se registra con error en el artefacto
- El resultado final indica "parcial" con fuentes disponibles

## Verification Commands

(Los comandos exactos dependen de la implementación. Esta sección se completa
en la fase de implementación.)

```bash
# Unit tests por etapa
npx vitest run tests-new/pipeline/stages/

# Integration test — pipeline completo
npx vitest run tests-new/pipeline/integration/

# API test
npx vitest run tests-new/api/

# Frontend view test
npx vitest run tests-new/frontend/
```
