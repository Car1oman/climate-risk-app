# PASO-2 — Validación de Entrada

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `validateSignal()` |
| **Ubicación** | `pipeline/stages/05-phenomena/index.js:25-50` |
| **Stage** | Stage 05 — Phenomena Consolidation (ID: 5) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-15 |
| **Propósito** | Documentación de la validación defensiva de entrada que garantiza la autonomía del stage |

---

## 1. Resumen Ejecutivo

PASO-2 valida cada señal de entrada para los campos requeridos por Stage 5 antes de procesarla. Señales malformadas se excluyen del procesamiento y se registran en `phenomena_not_detected` con evidencia específica. Si `signals` no es array, se retorna resultado vacío sin error.

**Pre-condición obligatoria**: Stage 5 es autónomo — no depende de que la validación upstream (Stage 4 Zod schema) funcione correctamente.

---

## 2. Lógica de validación

### 2.1 Guard clause: signals no es array

```javascript
const rawSignals = input?.signals;
if (!Array.isArray(rawSignals)) {
  return { phenomena: [], phenomena_not_detected: [] };
}
```

**Razón**: Si `input` es undefined, null, o `signals` no es un array, Stage 5 retorna resultado vacío en lugar de lanzar error. Esto hace el stage resiliente a cambios en la interfaz upstream.

### 2.2 Validación por señal

`validateSignal(s, index)` verifica tres campos:

| Campo | Tipo esperado | Validación | Error si falla |
|-------|---------------|------------|----------------|
| `name` | string (no vacío) | `typeof s.name === "string" && s.name.trim() !== ""` | "campo 'name' ausente o vacío" |
| `source_quality` | objeto con `.score` number\|null | `s.source_quality != null && typeof s.source_quality === "object"` | "campo 'source_quality' ausente o no es objeto" |
| `source_quality.score` | number \| null | `typeof score === "number" \|\| score === null` | "source_quality.score no es número ni null" |
| `signal_strength` | objeto con `.score` number | `s.signal_strength != null && typeof s.signal_strength === "object"` | "campo 'signal_strength' ausente o no es objeto" |
| `signal_strength.score` | number | `typeof score === "number"` | "signal_strength.score no es número" |

**Campos opcionales** (usados si están presentes pero no validados):
- `signal_id`: UUID — emitido como contributing_signals
- `value`: any — usado para activación categórica
- `anomaly_value`: number|null — usado para activación direccional

### 2.3 Registro de errores

Cada señal malformada genera una entrada en `phenomena_not_detected`:
```javascript
{
  name: "señal_malformada",
  reason: "Señal malformada excluida del procesamiento",
  evidence: "Señal[2](wind_anomaly): source_quality.score no es número ni null (recibido: string)"
}
```

---

## 3. Justificación

**H-5.12 (BAJO)**: La validación defensiva hace Stage 5 autónomo y auditable. Aunque Stage 4 siempre produce señales correctas gracias al Zod schema (`ClimateSignalSchema`), un cambio futuro en Stage 4 o un error de integración no propagaría datos malformados a los cálculos de Stage 5.

**Patrón consistente**: Ningún otro stage valida entrada (Stage 4 y 6 tienen el mismo patrón de destructuring sin guard). Stage 5 es el primero en implementar esta práctica.

---

## 4. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-5.12 (BAJO): Sin validación de entrada | validateSignal() verifica name, source_quality, signal_strength |
