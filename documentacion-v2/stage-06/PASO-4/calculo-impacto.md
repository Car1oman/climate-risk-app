# PASO-4 — Cálculo de Impacto

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `calculateImpact()` |
| **Ubicación** | `pipeline/stages/06-risk/index.js:423-571` |
| **Stage** | Stage 06 — Risk Assessment (ID: 6) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación del cálculo de impacto (I) desde sensibilidad sectorial y exposición por bandas, usando media geométrica real |

---

## 1. Resumen Ejecutivo

calculateImpact() calcula el impacto como la media geométrica de la exposición (derivada del estado del fenómeno y su confianza) y la sensibilidad sectorial (escalada desde physical_sensitivity 0-1 a Likert 1-5). La exposición usa bandas no solapadas por estado que garantizan que active > projected > not_detected sin importar la confianza. CA NO se incluye en impacto (está en el denominador de la fórmula de riesgo).

---

## 2. Flujo detallado

### 2.1 Sensibilidad sectorial (H-6.4)

```javascript
const physicalSensitivity01 = resolvedProfile.physical_sensitivity;
const sensitivity = Math.round(physicalSensitivity01 * 4) + 1;
const sensitivityClamped = Math.max(1, Math.min(5, sensitivity));
```

**Fórmula**: `sensitivity_Likert = round(physical_sensitivity × 4) + 1`, clamped [1,5].

**Derivación**: factor=4 y offset=1 son la única solución del mapeo lineal f(x)=offset+factor·x anclado en f(0)=1, f(1)=5 (extremos de la escala Likert 1-5). offset NO es redundante con el clamp: sin offset, x=1.0 da round(1×4)=4, no 5 — el clamp solo puede bajar valores, nunca subirlos.

**Valores por sector**:

| Sector | physical_sensitivity | Sensibilidad Likert | Confianza |
|--------|---------------------|--------------------|-----------| 
| agriculture | 0.9 | 5 | ALTO |
| infrastructure | 0.7 | 4 | MEDIO-ALTO |
| retail | 0.6 | 3 | MEDIO |
| energy | 0.5 | 3 | MEDIO |
| finance | 0.3 | 2 | BAJO |

**Fundamento**: Ranking ordinal de juicio experto, no derivado de índice publicado. Ver sector-profiles.json._refs para análisis de sensibilidad ±0.2.

### 2.2 Exposición por bandas (H-6.5)

```javascript
const exposureBands = {
  active:      { floor: 4, band_width: 1 },  // [4, 5]
  projected:   { floor: 2, band_width: 1 },  // [2, 3]
  not_detected:{ floor: 1, band_width: 0 },  // [1, 1]
};
const band = exposureBands[phenomenon.status];
const exposureRaw = band.floor + Math.round(combined * band.band_width);
const exposure = Math.max(1, Math.min(5, exposureRaw));
```

**Fórmula**: `exposure = floor + round(combined × band_width)`

**Diseño de bandas**: La ÚNICA partición de {1..5} en 3 bloques consecutivos, monótonos y sin solape que:
- Usa la escala completa sin huecos
- Da a projected y active un bloque de tamaño 2 (mínimo para que combined tenga efecto observable)
- Deja not_detected fijo en 1 (sin modulación — no hay base física para que la confianza incremente exposición de un fenómeno no detectado)

**Protección NaN** (H-6.11): `Number.isFinite(phenomenon.confidence?.combined)` en vez de `?? 0`, porque `??` solo reemplaza null/undefined, no NaN. `Math.round(NaN × 0) = NaN`, no 0.

**Inversión corregida**: El diseño anterior (`base × (0.5 + 0.5×combined)`, base=4/3/1) permitía que "active" con baja confianza tuviera MENOS exposición que "projected" con alta confianza. Las bandas eliminan esta posibilidad.

### 2.3 Fórmula de impacto (H-6.3)

```javascript
const impactRaw = Math.round(Math.sqrt(exposure * sensitivityClamped));
const value = Math.max(1, Math.min(5, impactRaw));
```

**Fórmula**: `impact = round(√(exposure × sensitivity))`, clamped [1,5].

**Propiedades**:
- **Media geométrica real**: √(a×b), no (a×b)/5 como la versión anterior
- **Autonormalizada**: √(5×5)=5, √(1×1)=1 — sin divisor dependiente de la escala
- **Penaliza desequilibrio**: exposure=5, sensitivity=1 → impact=round(√5)=2 (no 3 como con /5)
- **Consistente** con OECD/JRC §6.3 y el principio de no-sustituibilidad ya usado para confidence_combination (SQ×SS)

**Ejemplos**:

| Sector | Sens | Estado | Combined | Exposición | Impacto |
|--------|------|--------|----------|------------|---------|
| agriculture | 5 | active | ≥0.5 | 5 | round(√25)=5 |
| finance | 2 | projected | <0.5 | 2 | round(√4)=2 |
| retail | 3 | active | <0.5 | 4 | round(√12)=3 |

### 2.4 Exposición detail (H-6.15)

```javascript
exposure_detail: {
  level: exposure,
  factors: { status, confidence_combined, band: [floor, floor+band_width] },
  context_variables_used: [],  // honesto — no consume canonical_variables hoy
}
```

`context_variables_used=[]` es correcto: la exposición se deriva únicamente de phenomenon.status y confidence.combined, no de variables canónicas.

---

## 3. Output de calculateImpact()

```javascript
{
  value: number,              // 1-5 Likert
  components: {
    exposure: number,         // 1-5 Likert
    sensitivity: number,      // 1-5 Likert
    physical_sensitivity: number,   // raw 0-1 del perfil sectorial
    sensitivity_scaled: number,     // Likert 1-5 después de escalación
    physical_sensitivity_source: "sector_specific" | "default",
    adaptive_capacity: number,      // solo por compatibilidad con schema
  },
  exposure_detail: {
    level: number,
    factors: { status, confidence_combined, band },
    context_variables_used: [],
  },
  justification: string,
}
```

---

## 4. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-6.3 (MEDIO): fórmula incorrecta (a×b/5 llamada "media geométrica") | Corregido a √(a×b), media geométrica real |
| H-6.4 (MEDIO): factor×4+1 arbitrario | Derivado de f(0)=1, f(1)=5 en escala lineal |
| H-6.5 (MEDIO): exposición con inversión active/projected | Bandas no solapadas: not_detected=[1,1], projected=[2,3], active=[4,5] |
| H-6.11 (CRÍTICO): NaN por confidence.combined=NaN | Number.isFinite() guard en vez de ?? 0 |
| H-6.13 (BAJO): fallback de sector-profiles silencioso | physical_sensitivity_source en output |
| H-6.18 (BAJO): sensibilidad no propagada al output | physical_sensitivity y sensitivity_scaled en components |
