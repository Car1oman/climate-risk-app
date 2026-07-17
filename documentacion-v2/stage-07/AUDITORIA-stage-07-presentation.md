# Auditoría Exhaustiva — Stage 07: Presentation

**Fecha:** 2026-07-17
**Auditor:** Independiente (revisión técnica)
**Alcance:** Exclusivamente Stage 7 — `pipeline/stages/07-presentation/index.js` (152 líneas)
**Dependencias revisadas:** `pipeline/shared/stage-interface.js`, `pipeline/shared/types.js`, `pipeline/shared/errors.js`, `specs/001-climate-risk-pipeline-rebuild/contracts/stage-07-presentation.md`, `pipeline/config/thresholds.json`

---

## Resumen Ejecutivo

Stage 7 es el módulo de presentación del pipeline. Recibe evaluaciones de riesgo de Stage 6 y produce una vista proyectada para UI (executive o analyst). A diferencia de los stages anteriores (que realizan cálculos analíticos complejos), Stage 7 es principalmente un módulo de **transformación de datos y generación de narrativa**. Su complejidad analítica es baja, pero su responsabilidad es crítica: es la capa que determina qué ve el usuario final y cómo se interpreta el riesgo.

**Hallazgo principal:** La mayoría de las decisiones de Stage 7 son **estructurales y de diseño**, no analíticas. No contiene fórmulas de cálculo de riesgo (las hereda de Stage 6), pero sí toma decisiones de agregación, umbralización semántica, generación de narrativa y selección de información que pueden sesgar la percepción del usuario. Los hallazgos de criticidad alta están relacionados con la **ausencia de trazabilidad en las decisiones de presentación** y con **valores por defecto que pueden producir resultados engañosos**.

---

## Hallazgos

### H-7.1: `calculateOverallRisk()` usa max-risk sin ponderación — un fenómeno "catastrófico" domina sin importar contexto

**Ubicación:** `pipeline/stages/07-presentation/index.js:71-78`

**Cálculo actual:**
```javascript
calculateOverallRisk(assessments) {
  if (!assessments || assessments.length === 0) return { level: "bajo" };
  const max = assessments.reduce((m, a) => {
    const order = { bajo: 0, medio: 1, alto: 2, catastrofico: 3 };
    return order[a.risk_level] > order[m.level] ? a : m;
  }, { risk_level: "bajo" });
  return { level: max.risk_level };
}
```

**Por qué es arbitrario:**

1. **El riesgo global se define como el riesgo máximo de cualquier fenómeno**, sin importar cuántos fenómenos haya ni cuál sea su contribución relativa. Un solo fenómeno "catastrófico" con baja probabilidad domina el riesgo global, aunque los demás 9 fenómenos sean "bajo". Esta es una elección de diseño de alto impacto que no está documentada ni justificada.

2. **No hay alternativas documentadas.** Un approach alternativo podría ser: promedio ponderado de scores, suma de scores, risk_score más alto, o una combinación. Cada uno produciría un resultado diferente. No hay análisis comparativo.

3. **El contrato (stage-07-presentation.md:26)** define `overall_risk: { level, label }` pero no especifica cómo se deriva el level. Stage 7 inventa la regla "max-risk" sin referenciar estándar alguno.

4. **ISO 31000:2018 §6.6** permite que la organización defina cómo consolidar múltiples riesgos, pero no prescribe "máximo" como método. El estándar COSO ERM (2017) sugiere una matriz de portafolio que considere correlación y concentración, no un simple max.

5. **La consecuencia práctica es significativa:** en un escenario con 5 fenómenos "bajo" y 1 "alto", el usuario ve "Riesgo Alto" como resultado global, lo cual puede generar una respuesta desproporcionada.

**Riesgo:** MEDIO. La elección es defensible como enfoque conservador ("worst case"), pero la falta de documentación y la ausencia de alternativas evaluadas la hacen difícil de defender ante un comité de expertos.

**Evidencia que debería existir:**
- Documentación de la regla "max-risk" como elección de diseño conservador.
- Referencia a COSO ERM §4.3 o ISO 31000:2018 §6.6 que justifique la consolidación por máximo.
- Análisis comparativo con al menos 2 alternativas (promedio ponderado, suma de scores).
- Justificación de por qué no se usa un approach de portafolio (correlación entre fenómenos).

**Alternativa técnicamente justificable:**
- Mantener "max-risk" pero documentarlo como "enfoque conservador worst-case" con referencia a COSO ERM.
- Agregar un segundo indicador: `risk_composite` (promedio ponderado) para dar contexto adicional.
- O usar `risk_level` del fenómeno con mayor `risk_score_raw` (no solo la categoría ordinal).

**Nivel de criticidad:** MEDIO

---

### H-7.2: `buildExecutiveSummary()` genera narrativa con placeholders sin verificación de completitud

**Ubicación:** `pipeline/stages/07-presentation/index.js:109-119`

**Cálculo actual:**
```javascript
buildExecutiveSummary(location, risk, assessments, sector, transitionRisks) {
  const locName = location.location_name || `${location.lat}, ${location.lon}`;
  const level = risk.level === "bajo" ? "no presenta" : `presenta nivel ${RISK_LABELS[risk.level] || risk.level}`;
  const phenCount = (assessments || []).filter(a => a.risk_level !== "bajo").length;
  const trCount = (transitionRisks || []).length;
  let summary = `${locName} ${level} de riesgo climático para el sector ${sector}. ` +
    `${phenCount} fenómeno(s) con riesgo relevante identificado(s).`;
  if (trCount > 0) {
    summary += ` Además, se identificaron ${trCount} riesgo(s) de transición para este sector.`;
  }
  return summary;
}
```

**Por qué es arbitrario:**

1. **El contrato (stage-07-presentation.md:68-73)** define un template narrativo más rico:
   ```text
   {location} presenta exposición {level} a fenómeno {phenomenon_name} {status}.
   {confidence_note}. {evidence_summary}. {recommendation_intro}
   ```
   La implementación ignora por completo este template y genera una narrativa diferente que no incluye `phenomenon_name`, `status`, `confidence_note`, `evidence_summary`, ni `recommendation_intro`.

2. **La narrativa no tiene "enlace al artefacto de evidencia"** como requiere la regla 2 del contrato: "Toda afirmación en la narrativa ejecutiva tiene un enlace interno al artefacto de evidencia (trace_id + señal/fenómeno específico)". El `trace_id` se incluye en el output (línea 39) pero no se referencia en la narrativa.

3. **`sector` se usa directamente en la narrativa** (`para el sector ${sector}`) pero no se valida que sea un string no-vacío. Si `sector` es undefined, el resumen dice "para el sector undefined".

4. **La regla 4 del rulesApplied** declara "Narrativas son templates — no hay generación con IA" pero la implementación no usa el template del contrato — genera una narrativa ad-hoc.

**Riesgo:** MEDIO. La narrativa es funcional pero no cumple el contrato de diseño. Un usuario que espera ver la narrativa del template no la obtiene.

**Evidencia que debería existir:**
- Implementación del template narrativo del contrato.
- Validación de que `sector` es un string no-vacío antes de inyectarlo.
- Referencia a `trace_id` en la narrativa para trazabilidad.
- Test que verifique que la narrativa contiene los campos del template.

**Alternativa técnicamente justificable:**
- Implementar el template del contrato: `${locName} presenta exposición ${level} a fenómeno ${phenomenonName} ${phenomenonStatus}. ${confidenceNote}. ${evidenceSummary}. ${recommendationIntro}.`
- Agregar validación: `const sectorLabel = sector || "no especificado";`
- Agregar `trace_id` al final de la narrativa para trazabilidad.

**Nivel de criticidad:** MEDIO

---

### H-7.3: `buildRecommendations()` usa reglas binarias sin priorización ni personalización

**Ubicación:** `pipeline/stages/07-presentation/index.js:122-136`

**Cálculo actual:**
```javascript
buildRecommendations(assessments, transitionRisks) {
  const recs = [];
  const high = (assessments || []).filter(a => a.risk_level === "alto" || a.risk_level === "catastrofico");
  if (high.length > 0) {
    recs.push("Implementar medidas de adaptación estructural para fenómenos de alto riesgo.");
  }
  const highTransition = (transitionRisks || []).filter(r => r.severity === "alta" || r.severity === "catastrofica");
  if (highTransition.length > 0) {
    recs.push("Evaluar estrategia de transición para mitigar riesgos regulatorios y de mercado.");
  }
  if (recs.length === 0) {
    recs.push("Mantener monitoreo regular de las condiciones climáticas.");
  }
  return recs;
}
```

**Por qué es arbitrario:**

1. **Las recomendaciones son textos estáticos hardcodeados**, no derivadas de los datos de entrada. No importa si hay 1 fenómeno "alto" o 10 — la recomendación es la misma. No se personaliza por sector, fenómeno, horizonte temporal, ni nivel de riesgo específico.

2. **La regla "Mantener monitoreo regular"** se produce cuando no hay riesgos altos, pero no distingue entre "no hay datos" (assessments vacío) y "hay datos pero todos son bajo". Un usuario que no tiene datos ve la misma recomendación que uno que tiene datos y todo es "bajo" — una diferencia epistemológica importante que se pierde.

3. **No hay recomendaciones específicas por tipo de riesgo de transición.** Un riesgo "regulatorio" alto podría requerir cumplimiento normativo, mientras que un riesgo "market" alto podría requerir diversificación de portafolio. La recomendación es genérica para ambos.

4. **El contrato (stage-07-presentation.md:28)** dice "Recomendaciones priorizadas" pero no hay sistema de priorización — solo se producen 0-2 recomendaciones genéricas.

5. **No se usa `severity` de los assessments** (solo `risk_level`) para priorizar. Un fenómeno "medio" con alta probabilidad podría ser más urgente que uno "alto" con baja probabilidad, pero la regla binaria no lo captura.

**Riesgo:** MEDIO. Las recomendaciones son funcionales pero no aportan valor analítico real. Un usuario experto las encontraría genéricas e inútiles.

**Evidencia que debería existir**
- Matrix de recomendaciones por tipo de riesgo × nivel de severidad.
- Personalización por sector (recomendaciones de adaptación difieren entre agriculture y finance).
- Referencia a frameworks de adaptación climática (e.g., IPCC AR6 WGII Ch.8 para recomendaciones sectoriales).
- Diferenciación entre "sin datos" y "riesgo bajo".

**Alternativa técnicamente justificable:**
- Implementar una matriz de recomendaciones configurable: `{ risk_level × sector → recommendation_template }`.
- Agregar recomendaciones específicas por tipo de transición (regulatory → compliance, market → diversification, etc.).
- Incluir la cantidad y tipo de fenómenos en la recomendación: "Para agriculture, 2 fenómenos de alto riesgo requieren adaptación estructural urgente."

**Nivel de criticidad:** MEDIO

---

### H-7.4: `buildConfidenceNote()` usa `probability.value / 5` como proxy de confianza — relación indirecta sin justificación

**Ubicación:** `pipeline/stages/07-presentation/index.js:138-144`

**Cálculo actual:**
```javascript
buildConfidenceNote(assessments) {
  if (!assessments || assessments.length === 0) return "Sin datos suficientes para evaluar confianza.";
  const avgSQ = assessments.reduce((a, r) => a + (r.probability.value / 5), 0) / assessments.length;
  if (avgSQ >= 0.7) return "Confianza alta en los resultados presentados.";
  if (avgSQ >= 0.4) return "Confianza media — verificar fuentes para mayor precisión.";
  return "Confianza baja — los resultados son indicativos y requieren validación adicional.";
}
```

**Por qué es arbitrario:**

1. **La variable se llama `avgSQ` pero calcula el promedio de `probability.value / 5`**, que es la probabilidad normalizada, no la calidad de la fuente (source_quality). SQ típicamente significa "Source Quality" en el contexto de este pipeline, pero aquí se usa para probabilidad. Esto es conceptualmente confuso y potencialmente engañoso.

2. **La confianza del usuario final se deriva de la probabilidad, no de la calidad de las fuentes ni de la cobertura de datos.** Un fenómeno con probabilidad alta (P=5) tiene "confianza alta" aunque las fuentes sean de baja calidad. Esto invierte la semántica: la confianza debería reflejar qué tan confiable es la evaluación, no cuán probable es el fenómeno.

3. **Los umbrales 0.7 y 0.4 son idénticos a los de `confidence_to_probability` en thresholds.json** (0.6 y 0.4 aproximadamente), pero se aplican a una magnitud diferente (probabilidad normalizada vs. confidence.combined). No hay justificación de por qué se reutilizan estos umbrales.

4. **El contrato (stage-07-presentation.md:47)** dice "Nota de confianza en una frase" pero no especifica cómo se deriva. Stage 7 inventa la regla sin documentación.

5. **`confidence.combined` de cada assessment** (que sí es una medida de confianza epistémica) está disponible pero no se usa. Se usa `probability.value` que es una transformsión ordinal de confidence.combined, perdiendo granularidad.

**Riesgo:** MEDIO. La nota de confianza puede ser engañosa: un fenómeno con alta probabilidad pero fuentes de baja calidad se reporta como "confianza alta".

**Evidencia que debería existir:**
- Definición clara de qué significa "confianza" en este contexto (¿confianza epistémica en la evaluación? ¿confianza en la probabilidad del fenómeno?).
- Uso de `confidence.combined` en lugar de `probability.value / 5` si se busca confianza epistémica.
- Referencia a IPCC AR6 WGII §1.4 sobre comunicación de incertidumbre.
- Análisis de sensibilidad: ¿cómo cambia la nota de confianza con diferentes umbrales?

**Alternativa técnicamente justificable:**
- Usar `confidence.combined` directamente: `const avgConfidence = assessments.reduce((a, r) => a + (r.probability.confidence?.combined ?? 0.5), 0) / assessments.length;`
- O mejor: usar el `source_quality` de las señales que contribuyeron a cada fenómeno.
- Agregar un campo `confidence_breakdown` al output: `{ epistemic: 0.7, data_quality: 0.5, model不确定性: 0.3 }`.

**Nivel de criticidad:** MEDIO

---

### H-7.5: Mapeo `RISK_COLORS` asocia "catastrofico" a "rojo" igual que "alto" — pierde distinción visual

**Ubicación:** `pipeline/stages/07-presentation/index.js:4`

**Cálculo actual:**
```javascript
const RISK_COLORS = { bajo: "verde", medio: "ámbar", alto: "rojo", catastrofico: "rojo" };
```

**Por qué es arbitrario:**

1. **Un fenómeno "catastrófico" tiene el mismo color que uno "alto"** en la UI. Si el sistema tiene una categoría separada para catastrofico (RiskLevelEnum incluye "catastrofico", y Stage 6 ahora la emite cuando impact.value >= 5), la presentación debería distinguir visualmente entre "alto" y "catastrofico".

2. **No hay documentación de por qué se colapsan las dos categorías a un mismo color.** Podría ser una limitación de diseño (el sistema de colores solo soporta 3 colores) o una decisión deliberada (no se quiere alarmar al usuario), pero no está documentado.

3. **El contrato (stage-07-presentation.md:43)** dice "semáforos de riesgo (bajo/medio/alto → verde/ámbar/rojo)" — solo menciona 3 niveles. Pero el sistema tiene 4 niveles (bajo/medio/alto/catastrofico). El contrato no cubre catastrofico.

**Riesgo:** BAJO. La información de "catastrófico" se pierde visualmente, pero el label textual sí distingue (RISK_LABELS tiene entrada separada para catastrofico).

**Evidencia que debería existir:**
- Decisión explícita de si catastrofico debe tener color diferenciado (e.g., "rojo oscuro", "morado").
- Actualización del contrato para cubrir la categoría catastrofico.
- Si se mantiene "rojo" para ambos, documentar que la distinción es solo textual (label), no visual (color).

**Alternativa técnicamente justificable:**
- Agregar un cuarto color: `catastrophic: "rojo oscuro"` o `catastrophic: "morado"`.
- O mantener rojo pero con un indicator visual adicional (e.g., borde grueso, ícono de alerta).
- Actualizar el contrato para incluir la categoría catastrofico.

**Nivel de criticidad:** BAJO

---

### H-7.6: `formatPhenomenonName()` tiene mapa hardcodeado de 7 fenómenos — sin cobertura completa

**Ubicación:** `pipeline/stages/07-presentation/index.js:80-91`

**Cálculo actual:**
```javascript
formatPhenomenonName(name) {
  const map = {
    ola_de_calor: "Ola de calor",
    ola_de_frio: "Ola de frío",
    sequia: "Sequía",
    vientos_fuertes: "Vientos fuertes",
    inundacion: "Inundación",
    el_nino: "El Niño",
    la_nina: "La Niña",
  };
  return map[name] || name.replace(/_/g, " ");
}
```

**Por qué es arbitrario:**

1. **El mapa cubre solo 7 fenómenos.** Si un fenómeno nuevo se agrega al pipeline (e.g., "granizo", "tormenta_electrica", "marejada"), cae al fallback `name.replace(/_/g, " ")` que produce "granizo" o "tormenta electrica" — funcional pero sin formato inconsistente con los demás.

2. **No hay fuente para las traducciones.** "Sequía" con tilde es correcto en español, pero "Ola de frío" podría ser "Ola de frío" o "Ola fría" dependiendo de la convención. No hay referencia a un glossario meteorológico estándar.

3. **El mapa es estático y no es configurable.** Si el pipeline se internationaliza a otro idioma, este mapa hardcodeado no funciona.

4. **El fallback `name.replace(/_/g, " ")`** produce nombres en minúsculas sin capitalizar. "ola_de_calor" → "ola de calor" (minúscula) vs. el mapa que produce "Ola de calor" (capitalizado). La inconsistencia de capitalización puede ser visible en la UI.

**Riesgo:** BAJO. El mapa funciona para los fenómenos actuales, pero no escala.

**Evidencia que debería existir:**
- Glosario de fenómenos climáticos con nombres en español (e.g., SENAMHI, WMO glossary).
- Configuración externa del mapa de nombres (e.g., en thresholds.json o phenomenon-definitions.json).
- Test que verifique que todos los fenómenos soportados tienen entrada en el mapa.

**Alternativa técnicamente justificable:**
- Mover el mapa a un archivo de configuración (e.g., `phenomenon-display-names.json`).
- Agregar capitalización automática: `return map[name] || name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());`.
- Agregar un campo `display_name` en phenomenon-definitions.json.

**Nivel de criticidad:** BAJO

---

### H-7.7: `getRiskContribution()` retorna score sin contexto — un número sin trazabilidad

**Ubicación:** `pipeline/stages/07-presentation/index.js:103-107`

**Cálculo actual:**
```javascript
getRiskContribution(phenomenon, assessments) {
  const assessment = (assessments || []).find(a => a.phenomenon_id === phenomenon.phenomenon_id);
  if (!assessment) return { level: "bajo", score: 0 };
  return { level: assessment.risk_level, score: assessment.risk_score_raw };
}
```

**Por qué es arbitrario:**

1. **El `score` se retorna sin contexto de escala.** Un `risk_score_raw` de 3.5 no significa nada sin saber que el rango possible es 0.2-25.0 (con la fórmula (P×I)/CA). El usuario ve "score: 3.5" pero no sabe si es alto, bajo, o en qué escala está.

2. **No se incluye `risk_level` en el contexto del fenómeno.** El campo `level` se retorna pero no se explica la relación entre level y score. Un score de 3.5 con level "medio" es consistente, pero un score de 3.5 con level "bajo" sería confuso.

3. **El fallback `score: 0` para Assessment no encontrado** es problemático: un score de 0 está por debajo del rango mínimo de la fórmula (0.2), lo cual es técnicamente imposible con datos reales. Esto puede confundir al frontend.

4. **El contrato (stage-07-presentation.md:26)** define `risk_contribution: { name, status, risk_contribution }` pero `risk_contribution` se define como `{ level, score }` sin más contexto.

**Riesgo:** BAJO. La información es funcional pero carece de contexto para interpretación por el usuario.

**Evidencia que debería existir:**
- Documentación de la escala del score (rango 0.2-25.0, fórmula (P×I)/CA).
- Agregar `score_normalized` (0-100) para facilitar la interpretación.
- O agregar `score_label` ("bajo", "medio", "alto") adicional al level.
- Cambiar el fallback a `{ level: "bajo", score: null }` en lugar de `score: 0`.

**Alternativa técnicamente justificable:**
- Retornar `{ level, score, score_range: [0.2, 25.0], score_formula: "(P×I)/CA" }`.
- O simplificar: `{ level, score: Math.round(risk_score_raw * 10) / 10 }` (redondeado a 1 decimal).
- Usar `score: null` en el fallback para indicar "sin datos" en vez de "score = 0".

**Nivel de criticidad:** BAJO

---

### H-7.8: Vista "analyst" incluye `sources_out_of_coverage: []` y `signal_detail: []` siempre vacíos

**Ubicación:** `pipeline/stages/07-presentation/index.js:48-49`

**Cálculo actual:**
```javascript
if (view === "analyst") {
  return {
    view: "analyst",
    response: {
      ...base,
      sources_used: this.getSourcesUsed(input),
      sources_out_of_coverage: [],
      signal_detail: [],
      // ...
    },
  };
}
```

**Por qué es arbitrario:**

1. **`sources_out_of_coverage` siempre es un array vacío.** El campo existe en el contrato (stage-07-presentation.md:33) pero no se implementa la lógica para poblarlo. Stage 6 no produce esta información, y Stage 7 no la infiere.

2. **`signal_detail` siempre es un array vacío.** El contrato (stage-07-presentation.md:34) dice "Señales con source_quality y signal_strength" pero Stage 7 no tiene acceso a las señales individuales — solo a los assessments consolidados. La información se perdió en stages anteriores.

3. **Estos campos vacíos son engañosos:** un analista que ve `sources_out_of_coverage: []` puede asumir que no hay fuentes fuera de cobertura, cuando en realidad la información simplemente no se recopiló.

4. **El contrato define `signal_detail?: SignalSummary[]` como opcional**, pero la implementación lo incluye siempre como array vacío, lo cual es diferente a no incluirlo (undefined).

**Riesgo:** MEDIO. Los campos vacíos pueden crear una falsa sensación de completitud. Un analista podría confiar en que no hay fuentes fuera de cobertura cuando la información no está disponible.

**Evidencia que debería existir:**
- Implementación de `sources_out_of_coverage` desde los datos de Stage 6 o Stage 5.
- O eliminación del campo del output si no se puede poblar.
- Documentación de qué información se pierde entre Stage 6 y Stage 7.

**Alternativa técnicamente justificable:**
- No incluir `sources_out_of_coverage` y `signal_detail` si no se pueden poblar (omisión vs. array vacío).
- O agregar un campo `_status: "not_implemented"` para indicar que la información no está disponible.
- Solicitar a Stage 6 que incluya `sources_out_of_coverage` y `signal_detail` en su output.

**Nivel de criticidad:** MEDIO

---

### H-7.9: `execute()` no valida la estructura del input — falla silenciosamente con datos incompletos

**Ubicación:** `pipeline/stages/07-presentation/index.js:17-69`

**Cálculo actual:**
```javascript
execute(input) {
  const { location, sector, assessments, phenomena, transition_risks, view = "executive" } = input;
  // No hay validación de que location, sector, assessments existan
  // No hay validación de que assessments sea un array
  // No hay validación de que phenomena sea un array
  const overallRisk = this.calculateOverallRisk(assessments);
  // ...
}
```

**Por qué es arbitrario:**

1. **No hay validación de campos requeridos.** Si `location` es undefined, `location.location_name` lanza un error. Si `assessments` es undefined, `assessments.length` lanza un error. El stage falla con un error runtime no controlado.

2. **El `StageInterface` base no impone validación.** `wrapArtifact()` (stage-interface.js:12) maneja errores, pero el error no es un `PresentationError` — es un TypeError genérico.

3. **El `sector` se usa en la narrativa** (`para el sector ${sector}`) pero no se valida que exista. Si es undefined, la narrativa dice "para el sector undefined".

4. **No hay schema de validación del input** en types.js para Stage 7. Los stages anteriores tienen schemas (e.g., RiskAssessmentSchema), pero Stage 7 no tiene un `PresentationInputSchema`.

**Riesgo:** MEDIO. El stage puede fallar con errores no controlados si el input es incompleto, lo cual puede causar errores 500 en el servidor.

**Evidencia que debería existir:**
- Schema de validación del input: `PresentationInputSchema` en types.js.
- Validación de campos requeridos antes de procesar.
- Manejo de errores tipados (`PresentationError`) en lugar de TypeError genéricos.

**Alternativa técnicamente justificable:**
- Agregar validación al inicio de `execute()`: `if (!input.location) throw new PresentationError("MISSING_LOCATION", "location is required");`.
- O agregar un schema Zod y validarlo: `const parsed = PresentationInputSchema.parse(input);`.
- Agregar campos opcionales con defaults: `const sector = input.sector || "no especificado";`.

**Nivel de criticidad:** MEDIO

---

### H-7.10: `getSourcesUsed()` filtra por `coverage_status === "available"` — criterio binario sin gradiente

**Ubicación:** `pipeline/stages/07-presentation/index.js:146-151`

**Cálculo actual:**
```javascript
getSourcesUsed(input) {
  const sources = input.sources_consulted || [];
  return sources
    .filter(s => s.coverage_status === "available")
    .map(s => ({ name: s.source_name, domain: s.source_domain, status: s.coverage_status }));
}
```

**Por qué es arbitrario:**

1. **Solo se muestran fuentes "available".** Fuentes con status "partial", "out_of_coverage", o "error" se excluyen del output. Un analista no puede ver qué fuentes estuvieron parcialmente disponibles o fallaron.

2. **El output mapea `source_name` → `name` y `source_domain` → `domain`**, pero no incluye `coverage_percentage`, `last_updated`, ni `reliability_score` — información que un analista necesitaría para evaluar la calidad de las fuentes.

3. **El contrato (stage-07-presentation.md:49)** dice "Fuentes consultadas y su estado" — esto implica mostrar TODAS las fuentes, no solo las disponibles.

4. **No hay referencia a estándares de calidad de datos** (ISO/IEC 25012) para determinar qué status incluir o excluir.

**Riesgo:** BAJO. La filtración es funcional pero puede ocultar información útil para el análisis.

**Evidencia que debería existir:**
- Documentación de por qué solo se muestran fuentes "available".
- Inclusión de fuentes "partial" con indicador de disponibilidad parcial.
- Referencia a ISO/IEC 25012 para clasificación de calidad de datos.

**Alternativa técnicamente justificable:**
- Mostrar todas las fuentes con su status: `{ name, domain, status, coverage_percentage }`.
- O filtrar por un umbral mínimo: `coverage_status !== "error"` (mostrar available y partial).
- Agregar un campo `_filtered_count` para indicar cuántas fuentes se excluyeron.

**Nivel de criticidad:** BAJO

---

### H-7.11: `rulesApplied` se declara pero no se verifica su implementación

**Ubicación:** `pipeline/stages/07-presentation/index.js:9-14`

**Cálculo actual:**
```javascript
this.rulesApplied = [
  "Todo valor numérico se traduce a categoría semántica antes de mostrar",
  "Toda afirmación en la narrativa ejecutiva tiene enlace al artefacto de evidencia",
  "La respuesta de UI es una proyección, no el artefacto completo",
  "Narrativas son templates — no hay generación con IA",
];
```

**Por qué es arbitrario:**

1. **La regla 2 dice "Toda afirmación en la narrativa ejecutiva tiene enlace al artefacto de evidencia"** pero `buildExecutiveSummary()` no incluye ningún enlace a evidencia. La narrativa es un string plano sin referencias internas.

2. **La regla 4 dice "Narrativas son templates — no hay generación con IA"** pero la implementación no usa un template configurado — genera la narrativa con template literals ad-hoc. Aunque técnicamente no es IA, tampoco es un template configurable como el del contrato.

3. **No hay verificación de que estas reglas se cumplan.** Son declaraciones textuales que se incluyen en el output (`wrapArtifact()` las agrega) pero no se validan programáticamente.

4. **El contrato (stage-07-presentation.md:59-66)** define 4 rules Applied ligeramente diferentes:
   - Regla 2 del contrato: "Toda afirmación en la narrativa ejecutiva tiene un enlace interno al artefacto de evidencia (trace_id + señal/fenómeno específico)."
   - Regla 4 del contrato: "Si se solicita exportación (PDF), el artefacto completo puede incluirse como anexo técnico, no en la vista por defecto."
   
   La implementación tiene reglas diferentes al contrato.

**Riesgo:** BAJO. Las reglas son declarativas y no afectan el cálculo, pero su incumplimiento puede generar confianza injustificada en el output.

**Evidencia que debería existir:**
- Alineación de `rulesApplied` con el contrato.
- O eliminación de reglas que no se implementan.
- Agregar verificación programática de las reglas (e.g., test que verifique que la narrativa tiene enlaces).

**Alternativa técnicamente justificable:**
- Actualizar `rulesApplied` para reflejar la implementación real.
- O implementar las reglas del contrato y mantener las declaraciones.
- Agregar tests que verifiquen el cumplimiento de cada regla.

**Nivel de criticidad:** BAJO

---

### H-7.12: `execute()` es sync pero `StageInterface.execute()` es async — inconsistencia de contrato

**Ubicación:** `pipeline/shared/stage-interface.js:8` vs `pipeline/stages/07-presentation/index.js:17`

**Cálculo actual:**
```javascript
// stage-interface.js:
async execute(input) { throw new Error(`Stage ${this.stageName} must implement execute()`); }

// 07-presentation/index.js:
execute(input) { ... return { view, response }; }  // No es async
```

**Por qué es arbitrario:**

1. **La interfaz base define `execute()` como `async`**, pero Stage 7 la implementa como sync. JavaScript permite esto (una función sync puede satisfacer una interface async), pero es una inconsistencia de diseño.

2. **Si en el futuro Stage 7 necesita operaciones asíncronas** (e.g., fetch de datos de evidencia, renderizado de templates externos), necesitará ser async.

3. **El orquestador del pipeline** (server.js) probablemente hace `await stage.execute(input)`, lo cual funciona con funciones sync pero es conceptualmente inconsistente.

**Riesgo:** BAJO. Funciona correctamente, pero es deuda técnica.

**Evidencia que debería existir:**
- Decisión explícita de sync vs. async documentada.
- Consistencia con los demás stages del pipeline.

**Alternativa técnicamente justificable:**
- Hacer `execute()` async para consistencia: `async execute(input) { ... }`.
- O documentar por qué Stage 7 es sync (no necesita operaciones async).

**Nivel de criticidad:** BAJO

---

### H-7.13: El output no incluye `stage`, `status`, ni `evidence_artifact` según el contrato

**Ubicación:** `pipeline/stages/07-presentation/index.js:42-68` vs `specs/.../contracts/stage-07-presentation.md:19-37`

**Cálculo actual:**
```javascript
// Contrato output:
{
  stage: "presentation",
  status: "success",
  view: "executive" | "analyst",
  response: { ... }
}

// Implementación output:
{
  view: "executive" | "analyst",
  response: { ... }
}
// No hay `stage`, `status`, ni `evidence_artifact`
```

**Por qué es arbitrario:**

1. **El contrato define `stage: "presentation"` y `status: "success"` como campos requeridos del output.** La implementación no los incluye — solo retorna `{ view, response }`.

2. **El contrato define `evidence_artifact` como referencia** (stage-07-presentation.md:11) pero la implementación no lo incluye en el output.

3. **El `wrapArtifact()` del StageInterface base** (stage-interface.js:12-24) agrega `stage_id`, `stage_name`, `status`, `duration_ms`, etc. al output final. Pero el output del `execute()` interno no los tiene — se agregan en la capa de orquestación.

4. **Esto crea una ambigüedad:** ¿el output de `execute()` debe cumplir el contrato directamente, o el contrato describe el output final después de `wrapArtifact()`?

**Riesgo:** BAJO. La capa de orquestación (`wrapArtifact()`) agrega los campos faltantes, pero la implementación de `execute()` no cumple el contrato directamente.

**Evidencia que debería existir:**
- Clarificación en el contrato de si se aplica al output de `execute()` o al output final de `wrapArtifact()`.
- O inclusión de `stage` y `status` en el output de `execute()`.

**Alternativa técnicamente justificable:**
- Agregar `stage: "presentation"` y `status: "success"` al output de `execute()`.
- O actualizar el contrato para reflejar que estos campos los agrega `wrapArtifact()`.

**Nivel de criticidad:** BAJO

---

### H-7.14: `calculateOverallRisk()` no considera la cantidad de fenómenos — un solo fenómeno "medio" = riesgo global "medio"

**Ubicación:** `pipeline/stages/07-presentation/index.js:71-78`

**Cálculo actual:**
```javascript
calculateOverallRisk(assessments) {
  if (!assessments || assessments.length === 0) return { level: "bajo" };
  const max = assessments.reduce((m, a) => {
    const order = { bajo: 0, medio: 1, alto: 2, catastrofico: 3 };
    return order[a.risk_level] > order[m.level] ? a : m;
  }, { risk_level: "bajo" });
  return { level: max.risk_level };
}
```

**Por qué es arbitrario:**

1. **Un solo fenómeno "medio" produce riesgo global "medio"**, aunque haya 10 fenómenos "bajo". La concentración del riesgo no se captura.

2. **No hay distinción entre "1 fenómeno alto" y "5 fenómenos altos".** Ambos producen riesgo global "alto", pero el segundo scenario es significativamente más grave.

3. **El contrato no especifica cómo se deriva el riesgo global**, pero un usuario podría esperar que la cantidad de fenómenos influya.

4. **COSO ERM (2017)** y ISO 31000:2018 §6.6 recomiendan considerar la concentración del riesgo al consolidar portafolios, no solo el máximo.

**Riesgo:** MEDIO. El riesgo global puede subestimar la severidad cuando múltiples fenómenos contribuyen.

**Evidencia que debería existir:**
- Documentación de la regla "max-risk" como elección conservadora.
- Análisis de alternativas: ¿qué pasa con 1 vs. 5 fenómenos "alto"?
- Referencia a COSO ERM §4.3 sobre consolidación de riesgos.

**Alternativa técnicamente justificable:**
- Agregar un campo `risk_count: { bajo: N, medio: N, alto: N, catastrofico: N }` al output.
- O usar `risk_composite` (promedio ponderado) como indicador adicional.
- Mantener `overall_risk.level` como max-risk pero documentarlo explícitamente.

**Nivel de criticidad:** MEDIO

---

## Resumen Consolidado

### 1. Elementos completamente fundamentados

| Elemento | Fundamento | Referencia |
|----------|-----------|------------|
| Escala de colores (verde/ámbar/rojo) para bajo/medio/alto | Convención estándar de semáforos de riesgo | ISO 31000:2018 §6.6 (comunicación de riesgo) |
| Vista executive vs. analyst | Patrón de presentación estándar (resumen vs. detalle) | stage-07-presentation.md (contrato) |
| Template de narrativa (template, no IA) | Decision de diseño documentada en contrato | stage-07-presentation.md:13, 68-76 |
| `trace_id` en el output | Trazabilidad requerida por contrato | stage-07-presentation.md:80-81 |
| Filtro de fuentes por `coverage_status` | ISO/IEC 25012 (Data Quality) | stages anteriores (source_quality) |

### 2. Elementos parcialmente fundamentados

| Elemento | Lo que tiene | Lo que falta | Criticidad |
|----------|-------------|--------------|------------|
| `calculateOverallRisk()` usa max-risk | Enfoque conservador razonable | Documentación, alternativas, referencia COSO ERM | MEDIO |
| `buildExecutiveSummary()` genera narrativa | Es funcional y legible | No cumple template del contrato, sin trazabilidad | MEDIO |
| `buildRecommendations()` produce recomendaciones | Cubre escenarios básicos | No son personalizadas, sin priorización, sin matrix sector×severidad | MEDIO |
| `buildConfidenceNote()` usa probability.value/5 | Umbrales 0.4/0.7 razonables | Confunde probabilidad con confianza epistémica, no usa confidence.combined | MEDIO |
| `RISK_COLORS` colapsa catastrofico=rojo | Funcional | Sin distinción visual para categoría separada | BAJO |
| `getSourcesUsed()` filtra available | Muestra fuentes relevantes | Excluye partial/out_of_coverage sin indicación | BAJO |
| Output no incluye stage/status | wrapArtifact() los agrega | Ambigüedad sobre en qué capa se aplica el contrato | BAJO |

### 3. Elementos arbitrarios o sin evidencia suficiente

| Elemento | Problema | Criticidad |
|----------|----------|------------|
| `calculateOverallRisk()` no pondera cantidad de fenómenos | Un solo fenómeno domina sin contexto de concentración | MEDIO |
| `buildExecutiveSummary()` no valida sector | Puede producir "para el sector undefined" | MEDIO |
| `sources_out_of_coverage` y `signal_detail` siempre vacíos | Falsa sensación de completitud | MEDIO |
| No hay validación de input en execute() | Errores runtime no controlados con datos incompletos | MEDIO |
| `rulesApplied` no se verifica ni cumple completamente | Reglas declarativas sin implementación | BAJO |
| `formatPhenomenonName()` hardcodeado, 7 fenómenos | No escala, sin fuente para traducciones | BAJO |
| `getRiskContribution()` retorna score sin contexto de escala | score: 0 en fallback es imposible bajo la fórmula | BAJO |
| `execute()` sync vs async | Deuda técnica, inconsistencia con interfaz | BAJO |

### 4. Acciones para alcanzar nivel profesional de trazabilidad

#### Prioridad MEDIA (resolver antes de v2)

1. **Documentar la regla `calculateOverallRisk()`** como enfoque conservador "worst-case" con referencia a COSO ERM §4.3 o ISO 31000:2018 §6.6. Agregar `risk_count` al output para dar contexto de concentración.

2. **Implementar el template narrativo del contrato** en `buildExecutiveSummary()`: incluir `phenomenon_name`, `status`, `confidence_note`, `evidence_summary`, y `recommendation_intro`. Agregar validación de `sector`.

3. **Implementar recomendaciones personalizadas** usando una matrix configurable `{ risk_level × sector × transition_type → recommendation }`. Referenciar IPCC AR6 WGII Ch.8 para recomendaciones sectoriales.

4. **Corregir `buildConfidenceNote()`** para usar `confidence.combined` en lugar de `probability.value / 5`. Renombrar la variable de `avgSQ` a `avgConfidence` para evitar confusión con source_quality.

5. **Poblar `sources_out_of_coverage` y `signal_detail`** desde los datos de Stage 6, o eliminarlos del output si no se pueden poblar.

6. **Agregar validación de input** al inicio de `execute()`: verificar que `location`, `assessments`, y `phenomena` existen y tienen la estructura correcta.

#### Prioridad BAJA (resolver antes de auditoría externa)

7. **Mover `formatPhenomenonName()` a un archivo de configuración** externo (e.g., `phenomenon-display-names.json`) para que sea extensible.

8. **Corregir el fallback de `getRiskContribution()`** para usar `score: null` en lugar de `score: 0`.

9. **Alinear `rulesApplied` con el contrato** o eliminar reglas que no se implementan.

10. **Hacer `execute()` async** para consistencia con la interfaz base.

11. **Agregar distinción visual para "catastrofico"** (color diferenciado o indicador adicional).

12. **Clarificar en el contrato** si los campos `stage`, `status`, `evidence_artifact` se aplican al output de `execute()` o al output final de `wrapArtifact()`.

13. **Incluir `confidence.combined` en el output de cada assessment** en la vista analyst, para que el analista pueda verificar la confianza epistémica de cada evaluación.

---

## Apéndice: Cobertura del Contrato

| Campo del Contrato | Implementado | Notas |
|--------------------|--------------|-------|
| `stage: "presentation"` | No (lo agrega wrapArtifact) | Ambigüedad sobre capa |
| `status: "success"` | No (lo agrega wrapArtifact) | Ambigüedad sobre capa |
| `view: "executive" \| "analyst"` | Sí | |
| `location: { name, coordinates }` | Sí | |
| `overall_risk: { level, label }` | Sí | Falta `color` en contrato (pero sí está en implementación) |
| `phenomena: { name, status, risk_contribution }[]` | Sí | |
| `executive_summary: string` | Sí | Pero no cumple template del contrato |
| `recommendations: string[]` | Sí | Pero no son personalizadas |
| `confidence_note: string` | Sí | Pero usa proxy incorrecto |
| `sources_used?: SourceSummary[]` | Sí | |
| `sources_out_of_coverage?: string[]` | Sí (siempre vacío) | No implementado |
| `signal_detail?: SignalSummary[]` | Sí (siempre vacío) | No implementado |
| `risk_calculation?: RiskCalculationSummary` | Sí | |
| `trace_id: UUID` | Sí | |
| `evidence_artifact: EvidenceArtifact` | No | Referenciado en contrato pero no en implementación |

---

## Estado de Resolución

**Fecha de revisión:** 2026-07-17 (verificado línea por línea contra `pipeline/stages/07-presentation/index.js` actual, ~690 líneas, como parte de `documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md`)
**Estado:** LOS 14 HALLAZGOS ORIGINALES CERRADOS + 1 HALLAZGO NUEVO (G1, de la auditoría E2E) TAMBIÉN CERRADO

> Esta sección se agrega porque el documento original (fechado 2026-07-17, el mismo día) ya estaba desactualizado respecto al código en el momento de escribirse — la tabla "Apéndice: Cobertura del Contrato" de arriba describe `sources_out_of_coverage`/`signal_detail` como "siempre vacío" y `executive_summary` como no conforme al template, ambos ya resueltos en el código actual.

| Hallazgo | Severidad | Resolución | Evidencia en código |
|---|---|---|---|
| H-7.1 / H-7.14 (max-risk sin ponderar concentración) | MEDIO | `overall_risk.level` se mantiene max-risk (documentado como "worst-case conservador", COSO ERM §4.3/ISO 31000 §6.6) pero se complementa con `risk_composite` (promedio) y `risk_count` (tally por nivel) | `calculateOverallRisk()` |
| H-7.2 (narrativa no cumple template del contrato) | MEDIO | `buildExecutiveSummary()` implementa el template literal (`{location} presenta exposición {level} a fenómeno {phenomenon_name} {status}. {confidence_note}. {evidence_summary}. {recommendation_intro}`), cita `trace_id` + `phenomenon_id` del driver, valida `sector` | `buildExecutiveSummary()` |
| H-7.3 (recomendaciones estáticas, sin priorización) | MEDIO | Matriz `adaptation-measures.json` (fenómeno×sector, tipo×sector), ordenada por `risk_score_raw`/`signal_strength` descendente, capada a 3+2 | `buildRecommendations()`, `lookupPhysicalMeasure()`/`lookupTransitionMeasure()` |
| H-7.4 (confidence_note usa probability como proxy de SQ) | MEDIO | Corregido a leer `phenomenon.confidence.combined` (la medida real de confianza epistémica), no `probability.value/5` | `buildConfidenceNote()` |
| H-7.5 (catastrofico = mismo color que alto) | BAJO | `RISK_COLORS.catastrofico = "morado"`, alineado con la UI de producción real (`riskLevelStyles.js`) | Constante `RISK_COLORS` |
| H-7.6 (formatPhenomenonName incompleto, 7/9) | BAJO | Movido a `phenomenon-definitions.json.display_names`, cubre las 9 entradas del enum con fuente citada por cada una | `formatPhenomenonName()` |
| H-7.7 (score sin escala, fallback=0 imposible) | BAJO | `score_scale {min,max,formula}` agregado; fallback corregido a `score:null` | `getRiskContribution()` |
| H-7.8 (sources_out_of_coverage/signal_detail siempre vacíos) | MEDIO | `getSourcesOutOfCoverage()`/`getSignalDetail()` implementados, leen datos reales de `input` (aplanado de `engine.js`) | Vista analyst en `execute()` |
| H-7.9 (sin validación de input) | MEDIO | `validateInput()` contra `PresentationInputSchema` (Zod), errores envueltos en `PresentationError` — primer uso real de `shared/errors.js` en todo el pipeline | `validateInput()` |
| H-7.10 (getSourcesUsed sin enriquecer shape) | BAJO | `mapSourceSummary()` compartido, agrega `authority_level`/`spatial_distance_km`/`resolution_native`/`duration_ms` | `mapSourceSummary()` |
| H-7.11 (rulesApplied no verificado) | BAJO | Las 4 reglas ahora citan el método/hallazgo que las implementa; brecha de exportación PDF (contrato §4) declarada explícitamente como NO implementada | `rulesApplied` |
| H-7.12 (execute sync vs async) | BAJO | `execute()` ahora `async` | línea ~127 |
| H-7.13 (output no incluye stage/status/evidence_artifact) | BAJO | Investigado y resuelto corrigiendo el **contrato** (no el código): esos campos los agrega `wrapArtifact()` en una capa distinta; `evidence_artifact` es estructuralmente irrecibible por Stage 7 (se construye después de que termina el loop de stages) | rulesApplied H-7.13 |
| **G1** (documentacion-v2/AUDITORIA-E2E-PIPELINE-V2.md, ALTA — hallazgo nuevo, no de este documento) | ALTA | `evaluation_coverage` (Stage 06) llegaba a Stage 07 vía el aplanado de `engine.js` pero ningún método lo proyectaba. Corregido: `risk_calculation[].evaluation_coverage` (vista analyst) + `overall_risk.evaluation_coverage_summary` (ambas vistas) | `calculateOverallRisk()`, `summarizeEvaluationCoverage()`, `execute()` |

**Veredicto post-verificación:** Stage 07 es, junto con Stage 05, el stage con mayor disciplina de "declarar el vacío en vez de fabricar precisión" del pipeline — cada recomendación/narrativa/nota de confianza cita su fuente real de datos o declara explícitamente su límite (p. ej. `signals_discarded` no incluido en `signal_detail`, "medida genérica" cuando no hay fila sectorial específica en el catálogo). El único gap real que sobrevivía (G1) no era de Stage 07 en sí, sino de qué tan aguas arriba (Stage 06) se calculaba un dato de trazabilidad genuino sin que nadie aguas abajo lo consumiera — ya cerrado.
