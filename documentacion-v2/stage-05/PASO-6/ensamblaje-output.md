# PASO-6 — Ensamblaje de Output

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | Bloque de output en `execute()` (index.js:220-245) |
| **Ubicación** | `pipeline/stages/05-phenomena/index.js` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del ensamblaje del output final: phenomena[] y phenomena_not_detected[] |

---

## 1. Resumen Ejecutivo

PASO-6 ensambla el output final del stage: un array `phenomena[]` con los fenómenos procesados (activos y no activos) y un array `phenomena_not_detected[]` con evidencia negativa para cada fenómeno que no se activó y cada señal malformada.

---

## 2. Estructura del output

### 2.1 phenomena[]

Cada entrada contiene:

```javascript
{
  phenomenon_id: uuid(),           // UUID único por ejecución
  name: entry.name,                // Nombre canónico del fenómeno
  status: active ? inferStatus(...) : "not_detected",
  confidence: {
    source_quality: avgSQ,          // SQ promedio de señales contribuyentes
    signal_strength: avgSS,         // SS promedio de señales contribuyentes
    combined,                       // Combinación según confidence_combination
  },
  contributing_signals: matchingSignals.map(s => s.signal_id),
  scenario: inferScenario(...),     // Hoy siempre null
  horizon: active ? inferHorizon(...) : null,
}
```

**Notas**:
- `phenomenon_id` es un UUID nuevo por ejecución — no es determinista.
- `status` usa `inferStatus()` para fenómenos activos, "not_detected" para inactivos.
- `horizon` es null para fenómenos no activos (sin horizonte que reportar).
- `scenario` es null para todas las señales actuales (H-5.11).

### 2.2 phenomena_not_detected[]

Cada entrada contiene:

```javascript
{
  name: string,       // Nombre del fenómeno o "señal_malformada"
  reason: string,     // Razón específica del no-detección
  evidence: string,   // Evidencia cuantitativa para auditoría
}
```

**Fuentes de entradas**:

| Fuente | name | Razón típica |
|--------|------|-------------|
| Sin señales | `entry.name` | "Sin señales requeridas disponibles en la entrada" |
| Sin señal requerida | `entry.name` | "Ninguna señal requerida presente en la entrada" |
| SQ bajo | `entry.name` | "Calidad de fuente insuficiente (SQ promedio = X, umbral = Y)" |
| Sin activación | `entry.name` | "Señales presentes pero sin evidencia de activación" |
| Señal malformada | `"señal_malformada"` | "Señal malformada excluida del procesamiento" |

---

## 3. Contrato vs. implementación

| Campo del contrato | Estado |
|-------------------|--------|
| `phenomena: ClimatePhenomenon[]` | Implementado |
| `phenomena_not_detected: {name, reason, evidence}[]` | Implementado (H-5.10) |
| `status: "success"` | Implementado (por StageInterface.wrapArtifact) |

---

## 4. Consumidores downstream

| Consumidor | Campo consumido | Uso |
|-----------|----------------|-----|
| Stage 06 (Risk) | `phenomena[]` | Itera para calcular P × I / CA por fenómeno |
| Stage 07 (Presentation) | `phenomena[].name, .status` | Mapea a nombres display y estados |
| Executive Dashboard | `phenomena[]` | Renderiza PhenomenonCard por fenómeno |
| Evidence Artifact | Output completo | Registra en stages[5].output |

---

## 5. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.3 (MEDIO): Contrato vs implementación | Output ahora cumple el contrato (phenomena + phenomena_not_detected) |
| H-5.9 (MEDIO): Status incompleto | inferStatus() produce active/projected |
| H-5.10 (MEDIO): phenomena_not_detected ausente | 4 puntos de captura con evidencia |
| H-5.11 (MEDIO): scenario/horizon null | inferHorizon() y inferScenario() implementados |
| H-5.12 (BAJO): Sin validación de entrada | Señales malformadas registradas en phenomena_not_detected |
| H-5.17 (BAJO): rulesApplied incompleto | rulesApplied actualizado con 15 reglas |
| H-5.18 (BAJO): Schema permisivo | PhenomenonNameEnum valida nombres |
