# Implementation Plan: Climate Risk Pipeline Rebuild

**Branch**: `001-climate-risk-pipeline-rebuild` | **Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-climate-risk-pipeline-rebuild/spec.md`

## Summary

Reconstrucción paralela trazable de la plataforma de riesgos climáticos con arquitectura
desacoplada en 7 etapas: Adquisición → Validación → Normalización → Señales → Fenómenos
→ Riesgo → Presentación. Cada etapa tiene contrato E/S explícito, produce artefactos
persistibles, validación en frontera, y metadatos de trazabilidad. Concurrencia controlada
(sin Promise.allSettled). Confianza bidimensional (Source Quality + Signal Strength).
UI dual (Ejecutivo + Analista) sobre el mismo artefacto de evidencia.

## Technical Context

**Language/Version**: Node.js (v22+), React 18+

**Primary Dependencies**: Express (backend actual como referencia), Supabase client,
librerías de validación (Zod), y cada fuente externa con su cliente HTTP propio.

**Storage**: Supabase (artefactos de evidencia, configuraciones versionadas),
filesystem local para caché temporal.

**Testing**: Vitest (unit), Supertest (integración), Playwright (E2E UI).

**Target Platform**: Web (desktop + mobile browser).

**Project Type**: Web application (backend + frontend), pipeline desacoplado.

**Performance Goals**: Consulta completa de riesgo en < 60s (incluso con 11+ fuentes).
Artefacto de evidencia generado en < 5s después de última fuente.

**Constraints**: Sin modificar el código existente (`server/`). Todo el código nuevo
en estructura paralela. Sin fusión estadística automática de fuentes.
Sin valores sintéticos para ubicaciones sin cobertura.

**Scale/Scope**: 1-100 consultas/día (fase inicial). ~20 fuentes externas, 7 etapas de pipeline,
UI dual.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

1. **Modular Decoupling** ✅ — Cada etapa es un módulo independiente con contrato E/S.
2. **Full Traceability** ✅ — Artefacto de evidencia captura toda transformación.
3. **Validate at Every Boundary** ✅ — Validación de entrada y salida en cada etapa.
4. **Observable Artifacts** ✅ — Artefacto persistible por ejecución de pipeline.
5. **User-Facing Abstraction** ✅ — UI dual con traducción técnico→negocio.
6. **Reference-Only Current System** ✅ — Código nuevo en estructura paralela.

Ninguna violación identificada. Todas las decisiones de dominio fueron resueltas
antes de iniciar el plan.

## Project Structure

### Documentation

```text
specs/001-climate-risk-pipeline-rebuild/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — research & decisions
├── data-model.md        # Phase 1 — entities & relationships
├── quickstart.md        # Phase 1 — validation guide
├── contracts/           # Phase 1 — stage contracts
│   ├── stage-01-acquisition.md
│   ├── stage-02-validation.md
│   ├── stage-03-normalization.md
│   ├── stage-04-signals.md
│   ├── stage-05-phenomena.md
│   ├── stage-06-risk.md
│   └── stage-07-presentation.md
└── tasks.md             # Phase 2 — task breakdown
```

### Source Code

```text
pipeline/                         # NUEVO — código del pipeline
├── orchestration/                # Orquestación del pipeline completo
│   └── engine.js
├── stages/
│   ├── 01-acquisition/           # Consulta a fuentes externas
│   │   ├── registry.js           # Registro de fuentes autoritativas
│   │   └── adapters/             # Un adapter por fuente externa
│   ├── 02-validation/            # Validación de datos crudos
│   │   ├── validators/           # Schemas Zod por fuente
│   │   └── rules/                # Reglas de cobertura, fill values
│   ├── 03-normalization/         # Normalización a variables canónicas
│   │   ├── mappers/              # Mapeo fuente→variable canónica
│   │   └── canonical-schema.js
│   ├── 04-signals/               # Derivación de señales climáticas
│   │   ├── detectors/            # Detectores por tipo de señal
│   │   └── confidence.js         # Cálculo source_quality + signal_strength
│   ├── 05-phenomena/             # Consolidación en fenómenos
│   │   └── consolidator.js
│   ├── 06-risk/                  # Evaluación de riesgo
│   │   ├── calculator.js         # Fórmula (P × I) / CA
│   │   └── impact/               # Evaluación de impacto por sector
│   └── 07-presentation/          # Proyección para UI
│       ├── executive.js          # Vista ejecutiva
│       └── analyst.js            # Vista analista
├── artifact/                     # Generación y persistencia del artefacto
│   └── builder.js
├── config/                       # Configuración versionada
│   ├── source-quality-weights.json  # Pesos de source quality
│   ├── authoritative-sources.json   # Registro de fuentes autoritativas
│   ├── adaptive-capacity.json       # Config de capacidad adaptativa
│   └── thresholds.json              # Umbrales de activación
└── shared/
    ├── errors.js                 # Error tipado
    └── types.js                  # Schemas compartidos

server-new/                       # NUEVO — endpoints y orquestación
├── routes/
│   └── climate-v2.js             # Nuevo endpoint (paralelo a climate.js)
└── middleware/
    └── trace-logger.js

src-new/                          # NUEVO — frontend
├── components/
│   ├── ExecutiveDashboard/
│   ├── AnalystViewer/
│   └── TraceInspector/
├── hooks/
│   └── useClimateRisk.js
└── pages/
    └── RiskAnalysis.jsx

tests-new/
├── pipeline/
│   ├── stages/                   # Tests por etapa
│   ├── integration/              # Tests de pipeline completo
│   └── fixtures/                 # Data de prueba (incluye Ricardo Palma)
├── api/
│   └── climate-v2.test.js
└── frontend/
    └── views.test.js
```

**Structure Decision**: Se crea una estructura paralela completa (`pipeline/`, `server-new/`,
`src-new/`, `tests-new/`) para aislar completamente el nuevo código del sistema actual.
Cada etapa del pipeline es un módulo independiente dentro de `pipeline/stages/`.

## Complexity Tracking

Sin violaciones de Constitution Check. No se requiere justificación de complejidad adicional.

## Research Notes

Ver [research.md](research.md) para decisiones detalladas. Resumen de las decisiones
de dominio ya resueltas en la fase de clarificación:

| Decisión | Resolución |
|----------|-----------|
| Fórmula de riesgo | (Probabilidad × Impacto) / Capacidad Adaptativa |
| Priorización de fuentes | Una fuente autoritativa por dominio, no fusión automática |
| Confianza | Bidimensional: source_quality (5 componentes con peso) + signal_strength |
| Cobertura espacial | Reglas por tipo de dato: vecino vs interpolación vs sin cobertura |
| Datos faltantes vs aproximables | Distinción explícita registrada en trazabilidad |
| Capacidad adaptativa | Cálculo interno multi-indicador, configuración versionada |
| Source quality pesos | Fijos y versionados: espacial 30%, temporal 20%, completitud 20%, resolución 20%, proximidad 10% |
| Probabilidad | Híbrida: fuente autoritativa si existe, sino cálculo interno |
| Impacto | Siempre cálculo interno desde exposición + sensibilidad + CA |
