# PASO-5 — Nota de Confianza

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `buildConfidenceNote()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:533-564` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la nota de confianza basada en confidence.combined de los fenómenos, con mapeo a Likert y clasificación en 3 categorías |

---

## 1. Resumen Ejecutivo

buildConfidenceNote() calcula la confianza epistémica promedio de las evaluaciones usando confidence.combined (geometric mean de SQ×SS, Stage 5 — la medida REAL de confianza del pipeline). Cada confidence.combined se mapea a un ordinal 1-5 con la misma tabla confidence_to_probability.mapping que Stage 6 usa para convertir esta variable. Los ordinales se promedian entre fenómenos (igual peso) y se clasifican en 3 categorías.

---

## 2. Flujo

```javascript
buildConfidenceNote(assessments, phenomena) {
  if (!assessments || assessments.length === 0) return "Sin datos suficientes para evaluar confianza.";

  const thresholds = getThresholds();
  const mapping = thresholds.confidence_to_probability?.mapping ?? DEFAULT_CONFIDENCE_TO_PROBABILITY_MAPPING;

  const ordinals = [];
  for (const a of assessments) {
    const phenomenon = (phenomena || []).find(p => p.phenomenon_id === a.phenomenon_id);
    const combined = phenomenon?.confidence?.combined;
    if (Number.isFinite(combined)) {
      let ordinal = 1;
      for (const [threshold, value] of mapping) {
        if (combined >= threshold) ordinal = value;
      }
      ordinals.push(ordinal);
    }
  }

  if (ordinals.length === 0) {
    return "Confianza no evaluable — no se encontró confidence.combined para los fenómenos evaluados.";
  }

  const avgOrdinal = ordinals.reduce((sum, v) => sum + v, 0) / ordinals.length;
  if (avgOrdinal >= 4) return "Confianza alta en los resultados presentados.";
  if (avgOrdinal >= 3) return "Confianza media — verificar fuentes para mayor precisión.";
  return "Confianza baja — los resultados son indicativos y requieren validación adicional.";
}
```

---

## 3. Mapeo confidence.combined → Ordinal

**Tabla reutilizada** (thresholds.json confidence_to_probability.mapping):

| confidence.combined | Ordinal | Etiqueta IPCC |
|---------------------|:-------:|---------------|
| [0.0, 0.2) | 1 | muy improbable |
| [0.2, 0.4) | 2 | improbable |
| [0.4, 0.6) | 3 | posible |
| [0.6, 0.8) | 4 | probable |
| [0.8, 1.0] | 5 | muy probable |

**Fundamento**: Misma tabla que Stage 6 usa para convertir confidence.combined a probabilidad (H-5.13, H-6.7). Reutilización principiada — no un umbral nuevo inventado para Stage 7.

---

## 4. Clasificación del Promedio

| Rango de avgOrdinal | Categoría | Nota |
|---------------------|-----------|------|
| [4, 5] | "Confianza alta" | Fenómenos con combined ≥ 0.6 (probable/muy probable) |
| [3, 4) | "Confianza media" | Fenómenos con combined entre 0.4-0.6 (posible) |
| [1, 3) | "Confianza baja" | Fenómenos con combined < 0.4 (improbable/muy improbable) |

**Fundamento del colapso 5→3**: Misma convención que risk_classification.low_max/medium_max usa para colapsar la escala Likert 1-5 de IPCC AR6 WGII Fig.SPM.1 a 3 categorías (bajo/medio/alto). No es una segunda escala inventada — es el mismo tipo de partición.

---

## 5. Manejo de Datos Faltantes

| Escenario | Comportamiento | Justificación |
|-----------|----------------|---------------|
| assessments vacío/null | "Sin datos suficientes para evaluar confianza" | Sin evaluaciones, no hay nada que evaluar |
| confidence.combined ausente para un fenómeno | Se excluye del promedio | H-5.6: null ≠ 0 — "dato no disponible" es distinto de "confianza mínima confirmada" |
| confidence.combined no-finito (NaN, Infinity) | Se excluye del promedio | Mismo criterio que H-5.6 |
| Ningún assessment tiene confidence.combined | "Confianza no evaluable" | No se fabrica un promedio sobre cero datos |

---

## 6. Por qué NO se usa probability.value (H-7.4)

La implementación anterior usaba `assessment.probability.value / 5` bajo el nombre `avgSQ` ('source quality'). Esto era conceptualmente incorrecto por dos razones:

1. **probability.value NO es una medida de confianza epistémica** — es la probabilidad del fenómeno, que además (H-6.9) puede venir de una fuente externa (GRI Oxford) sin relación con la calidad de la evaluación.

2. **El nombre "avgSQ" sugería 'source quality'** sin serlo — confundía al lector.

confidence.combined (geometric mean de SQ×SS, Stage 5) SÍ es la medida completa de confianza que accounta por calidad de fuente Y fuerza de señal.

---

## 7. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.4 (MEDIO): probability.value/5 como proxy de confianza | Corregido a confidence.combined |
| H-7.4 (MEDIO): variable llamada "avgSQ" sin ser source quality | Renombrada lógicamente a avgOrdinal |
| H-7.4 (MEDIO): umbrales 0.7/0.4 sin relación con la magnitud | Reutiliza confidence_to_probability.mapping (misma tabla que Stage 6) |
| H-7.4 (MEDIO): confidence.combined ausente = fabricación | Se excluye del promedio (H-5.6: null ≠ 0) |
