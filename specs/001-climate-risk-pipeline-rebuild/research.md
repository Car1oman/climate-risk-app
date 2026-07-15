# Research & Design Decisions

**Date**: 2026-06-22 | **Spec**: [spec.md](spec.md)

## Domain Decisions (resolved during clarification)

### Risk Formula
- **Decision**: `Risk = (Probability × Impact) / Adaptive Capacity`
- **Rationale**: Alineado con Manual de Adaptación Intercorp (líneas 888-893).
  La capacidad adaptativa reduce el riesgo efectivo.
- **Alternatives**: IPCC AR6 full framework (`H × E × V`) — más completo pero
  requiere datos de vulnerabilidad que no están disponibles como fuente directa.

### Source Prioritization
- **Decision**: Una fuente autoritativa por dominio de información. No fusión
  automática. Otras fuentes = evidencia complementaria.
- **Rationale**: Transparencia y auditabilidad. Un promedio ponderado oculta
  el origen real del dato.
- **Alternatives**: Weighted average fusion (rechazado), all-sources report (no
  da un valor definitivo).

### Confidence Model
- **Decision**: Bidimensional: `source_quality` (0-1) + `signal_strength` (0-1).
  Nunca se colapsa a un solo valor.
- **Rationale**: Una dimensión sola no distingue "buena fuente, señal débil"
  de "mala fuente, señal fuerte".
- **Components**:
  - Source Quality: coverage_spatial(30%), coverage_temporal(20%),
    completeness(20%), resolution(20%), proximity(10%)
  - Signal Strength: anomaly_vs_historical, temporal_persistence,
    cross_period_consistency, projected_magnitude

### Spatial Coverage
- **Decision**: Reglas por tipo de dato (observación, proyección, geofísico, alta resolución).
  Distancia registrada y penalizada en source_quality.
- **Threshold**: Distancia máxima aceptable configurable por fuente. Superado = "sin cobertura".
- **Alternatives**: Universal nearest-neighbor (rechazado: no distingue
  tipos de dato), universal interpolation (rechazado: crea precisión falsa).

### Data Coverage Classification
- **Decision**: Distinción explícita entre "dato faltante" y "dato aproximable".
- **Rationale**: Son cualitativamente distintos. Una celda a 5.85° no es "aproximable",
  es "sin cobertura". Una celda a 0.4° sí es aproximable.
- **Ricardo Palma case**: `climate_cells` celda ID 179 a 5.85° ≈ 650km →
  clasificado como "sin cobertura".

### Adaptive Capacity
- **Decision**: Cálculo interno multi-indicador. Configuración versionada.
- **Indicadores**: poverty_rate, infrastructure_quality, healthcare_access,
  financial_resources, existing_adaptation_measures.
- **Rationale**: No existe una sola fuente de CA. WBG, GRI, y datos locales
  deben combinarse con pesos configurables.

### Probability
- **Decision**: Híbrido — fuente autoritativa si existe (e.g., GRI ISIMIP
  para sequía), sino cálculo interno desde señales.
- **Rationale**: No todas las fuentes proveen probabilidades; el sistema
  debe poder funcionar con datos incompletos.

### Impact
- **Decision**: Siempre cálculo interno.
- **Inputs**: Exposición (del cruce fenómeno×contexto) + sensibilidad del sector
  + capacidad adaptativa.

### Visualization Levels
- **Decision**: Dual — Executive (semáforos, narrativa, recomendaciones)
  + Analyst (confianza, fuentes, trazabilidad, reglas).
- **Rationale**: Un solo dashboard frustra a ambos perfiles. Dos dashboards
  separados duplican lógica. Una misma data con dos proyecciones es el punto óptimo.

### Evidence Artifact
- **Decision**: Objeto JSON auto-contenido como source of truth,
  independiente de cualquier UI.
- **Rationale**: Auditorías, debugging, y consumo por LLM sin depender de
  la interfaz gráfica. Más importante que la UI misma.

## Architecture Patterns

### Pipeline Pattern
- **Decision**: Pipeline secuencial con 7 etapas, cada etapa productora de
  un artefacto intermedio. Orquestación controlada (no Promise.allSettled).
- **Rationale**: Etapas desacopladas permiten testear, reemplazar y auditar
  cada transformación independientemente.

### Error Handling
- **Decision**: Errores tipados por etapa, nunca silenciosos. Cada error
  se registra en el artefacto de evidencia con stage_id, timestamp y detalle.
- **Rationale**: `Promise.allSettled` del sistema actual oculta fallos.
  Cada error debe ser trazable a la etapa exacta.

### Configuration
- **Decision**: Pesos, umbrales, fuentes autoritativas y fórmulas en
  archivos JSON versionados en `pipeline/config/`.
- **Rationale**: Permite cambiar comportamiento sin modificar código.
  Los cambios quedan trazados en git.

## Current System Analysis

### What to port (functional equivalence)
- Consulta de coordenadas + sector → análisis de riesgo
- 20+ servicios externos (mismos endpoints, misma autoritatividad)
- Mapeo sector→impacto (retail, finanzas, educación, salud)
- Narrativa en lenguaje natural

### What to fix (not port)
- Silenciar errores (`allSettled` sin manejo)
- Pipeline monolítico en una ruta
- Sin artefactos intermedios
- Sin validación de datos
- Capas acopladas (Layer1 importa servicios directamente)
- UI mixta (técnico + negocio en la misma vista)
