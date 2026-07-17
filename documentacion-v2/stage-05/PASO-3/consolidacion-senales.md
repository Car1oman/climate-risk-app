# PASO-3 — Consolidación de Señales en Fenómenos

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | Loop en `execute()` (index.js:110-233), `aggregateSignals()` (aggregate-signals.js), `combineConfidence()` (combine-confidence.js) |
| **Ubicación** | `pipeline/stages/05-phenomena/index.js`, `pipeline/stages/05-phenomena/aggregate-signals.js`, `pipeline/stages/05-phenomena/combine-confidence.js` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación del proceso de consolidación: coincidencia de señales, agregación de scores, y combinación de confianza bidimensional |

---

## 1. Resumen Ejecutivo

PASO-3 itera sobre cada definición de fenómeno en `phenomenon-definitions.json`, busca señales coincidentes en la entrada, verifica la presencia de al menos una señal requerida (Rule 1 del contrato), agrega source_quality y signal_strength sobre las señales contribuyentes usando el método configurado, combina ambas dimensiones en un score único, y produce tanto los fenómenos activos como la evidencia negativa para los no detectados.

---

## 2. Flujo detallado

### 2.1 Coincidencia de señales

```javascript
const candidateNames = [...entry.required_signals, ...entry.optional_signals];
const matchingSignals = signals.filter(s => candidateNames.includes(s.name));
```

**Lógica**: Se buscan señales cuyo `name` coincida con cualquier señal requerida u opcional de la definición. Las señales que no coinciden con ningún fenómeno simplemente se ignoran (no generan error).

### 2.2 Verificación de señales requeridas (Rule 1)

```javascript
const hasRequiredSignal = matchingSignals.some(s => entry.required_signals.includes(s.name));
if (!hasRequiredSignal) { /* → phenomena_not_detected */ }
```

**Regla del contrato** (stage-05-phenomena.md:44): "Un fenómeno necesita al menos una señal requerida activa para ser considerado." Las señales opcionales solas no activan un fenómeno.

### 2.3 Agregación de scores

**H-5.4**: `aggregateSignals()` promedia source_quality y signal_strength sobre las señales contribuyentes usando el método configurado.

| Método | Fórmula | Propiedad |
|--------|---------|-----------|
| `arithmetic_mean` | (s₁ + s₂ + ... + sₙ) / n | Default — igualdad Laplace |
| `geometric_mean` | (s₁ × s₂ × ... × sₙ)^(1/n) | Penaliza desequilibrios (OECD/JRC §6.3) |
| `required_first` | (wᵣ × Σ required + wₒ × Σ optional) / (wᵣ×nᵣ + wₒ×nₒ) | Required pesa más |
| `type_weighted` | Σ(wₜ × s) / Σ(wₜ) | Anomaly > categorical > projected |

**H-5.6**: `source_quality.score = null` se excluye del promedio (no se trata como 0). Null significa "calidad desconocida", no "calidad = 0". Si todas las señales tienen SQ=null → avgSQ = 0 → fenómeno excluido por minConfidence.

**H-5.19**: `type_weighted` pondera por tipo de señal: anomaly=1.0 (evidencia observada), categorical=0.8 (estado discreto), projected=0.5 (evidencia modelada). Refleja la distinción epistemológica entre "sabemos que está pasando" y "los modelos predicen que pasará".

### 2.4 Combinación de confianza

**H-5.5**: `combineConfidence()` combina SQ y SS en un score único usando el método configurado.

| Método | Fórmula | Propiedad |
|--------|---------|-----------|
| `geometric_mean` | √(sq × ss) | Default — penaliza desequilibrios |
| `min` | min(sq, ss) | Conservador — piso absoluto |
| `weighted` | (w₁×sq + w₂×ss) / (w₁+w₂) | Sin penalización |

**Decisión documentada** (thresholds.json): geometric_mean como default porque SQ y SS son dimensiones conceptualmente distintas (calidad de fuente vs. fuerza de señal) que no son perfectamente sustituibles.

### 2.5 Gating por SQ mínimo

```javascript
const minConfidence = entry.min_confidence ?? globalMinSourceQuality;
if (avgSQ < minConfidence) { /* → phenomena_not_detected */ }
```

- `entry.min_confidence`: umbral por fenómeno (desde phenomenon-definitions.json)
- `globalMinSourceQuality`: umbral global (thresholds.json: 0.30, ISO/IEC 25012 §6.1)

---

## 3. Evidencia negativa (phenomena_not_detected)

Cada fenómeno que no se activa genera una entrada con razón específica:

| Punto de captura | Razón | Evidencia incluida |
|------------------|-------|-------------------|
| Sin señales en entrada | "Sin señales requeridas disponibles en la entrada" | Señales esperadas vs. recibidas |
| Señales presentes, ninguna requerida | "Ninguna señal requerida presente en la entrada" | Señales que coinciden vs. requeridas |
| SQ promedio < umbral | "Calidad de fuente insuficiente" | SQ por señal, umbral, método |
| Sin activación | "Señales presentes pero sin evidencia de activación" | SS por señal, umbral, tipo de activación |

---

## 4. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.4 (MEDIO): Media aritmética sin ponderación | 4 métodos configurables en aggregate-signals.js |
| H-5.5 (MEDIO): Geometric mean sin documentar penalización | Análisis completo en thresholds.json _refs |
| H-5.6 (MEDIO): SQ=null → 0 | Null excluido del promedio (no tratado como 0) |
| H-5.10 (MEDIO): phenomena_not_detected no implementado | 4 puntos de captura con evidencia cuantitativa |
