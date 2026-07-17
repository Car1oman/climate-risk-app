# PASO-6 — Narrativa Ejecutiva

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `buildExecutiveSummary()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:361-407` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la narrativa ejecutiva que implementa literalmente el template del contrato con trazabilidad a evidencia |

---

## 1. Resumen Ejecutivo

buildExecutiveSummary() genera el string de narrativa ejecutiva implementando literalmente el template del contrato (stage-07-presentation.md, Narrative Template). Cada slot del template se llena con datos derivados de los PASO anteriores, con validación de campos y trazabilidad a trace_id + phenomenon_id del driver.

---

## 2. Template del Contrato

```text
{location} presenta exposición {level} a fenómeno {phenomenon_name} {status}.
{confidence_note}. {evidence_summary}. {recommendation_intro}
```

**Implementación**:

```javascript
return (
  `${locName} presenta exposición ${levelLabel} a fenómeno ${phenomenonName} ${status} ` +
  `en el sector ${sectorLabel}. ${confidenceNote} ${evidenceSummary}. ${recommendationIntro}.`
);
```

**Extensión deliberada del template**: El template del contrato no tiene un slot {sector}, pero se conserva la cláusula "en el sector X" como contexto de negocio relevante para el lector (ya presente en el diseño original), ahora validada en vez de eliminada.

---

## 3. Resolución de cada Slot

### 3.1 {location}

```javascript
const locName = location.location_name || `${location.lat}, ${location.lon}`;
```

Usa location_name si existe; coordenadas como fallback.

### 3.2 {level}

```javascript
const levelLabel = RISK_LABELS[risk.level] || risk.level;
```

Etiqueta legible del nivel de riesgo global (max-risk).

### 3.3 {phenomenon_name} + {status}

```javascript
const driverPhenomenon = (phenomena || []).find(p => p.phenomenon_id === risk.driverPhenomenonId);
const phenomenonName = driverPhenomenon ? this.formatPhenomenonName(driverPhenomenon.name) : "ninguno identificado";
const status = driverPhenomenon ? this.formatStatus(driverPhenomenon.status) : "sin datos";
```

**Decisión clave**: El template es singular ("a fenómeno X"), pero Stage 7 recibe N assessments. Se nombra el fenómeno **driver** (mismo assessment con risk_level máximo que determina overall_risk.level, PASO-2) en vez de uno arbitrario. Esto garantiza coherencia: el semáforo mostrado y el fenómeno nombrado en la narrativa son siempre el mismo.

### 3.4 {confidence_note}

```javascript
const confidenceNote = this.buildConfidenceNote(assessments, phenomena);
```

Reutiliza el método del PASO-5. Se calcula dos veces (una para el output, una para la narrativa) pero el resultado es determinista.

### 3.5 {evidence_summary}

```javascript
const relevantCount = (assessments || []).filter(a => a.risk_level !== "bajo").length;
const totalCount = (assessments || []).length;
const trCount = (transitionRisks || []).length;
const transitionClause = trCount > 0 ? ` y ${trCount} riesgo(s) de transición` : "";
const evidenceSummary =
  `${relevantCount} de ${totalCount} fenómeno(s) evaluado(s) presentan riesgo relevante${transitionClause}` +
  ` (evidencia completa en trace_id=${traceId || "N/D"}` +
  (risk.driverPhenomenonId ? `, phenomenon_id=${risk.driverPhenomenonId})` : ")");
```

**Cumplimiento de Rules Applied §2**: Cada evidence_summary incluye literalmente `trace_id=...` y `phenomenon_id=...` del driver — enlace explícito al artefacto de evidencia, no una referencia genérica.

### 3.6 {recommendation_intro}

```javascript
const recommendationIntro =
  recommendations && recommendations.length > 0
    ? `Se recomienda: "${recommendations[0]}"${recommendations.length > 1 ? ` (${recommendations.length - 1} recomendación(es) adicional(es) a continuación)` : ""}`
    : "Sin recomendaciones adicionales en este momento";
```

**Reutiliza el array recommendations YA calculado** por buildRecommendations() (PASO-4) — evita fabricar una segunda narrativa de recomendación independiente que podría divergir del texto realmente mostrado en response.recommendations.

### 3.7 {sector}

```javascript
const sectorLabel = typeof sector === "string" && sector.trim() ? sector.trim() : "no especificado";
```

**Validación H-7.2**: Sin esta validación, sector undefined producía "para el sector undefined" interpolado literalmente.

---

## 4. Orden de Cálculo

**Cambio de diseño**: recommendations se calcula ANTES que executive_summary en execute() (invirtiendo el orden anterior). Razón: recommendation_intro reusa el array recommendations — si se calculara después, podría divergir.

```
execute()
├─ calculateOverallRisk()           ← PASO-2
├─ buildRecommendations()           ← PASO-4 (ANTES que executive_summary)
├─ buildConfidenceNote()            ← PASO-5
└─ buildExecutiveSummary()          ← PASO-6 (reusa recommendations y confidence_note)
```

---

## 5. Ejemplo de Output

```
"Ricardo Palma presenta exposición Alto a fenómeno Ola de calor Activo en el sector retail.
Confianza alta en los resultados presentados. 2 de 3 fenómeno(s) evaluado(s) presentan
riesgo relevante y 1 riesgo(s) de transición (evidencia completa en trace_id=abc-123,
phenomenon_id=xyz-789). Se recomienda: "[Alto] Ola de calor: Techos fríos, sombreados
y recubrimientos reflectivos — Membranas reflectivas... (fuente: Anexo 10.2 Cat. Medidas
— Retail / Techos fríos)."
```

---

## 6. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.2 (MEDIO): narrativa ad-hoc sin template del contrato | Template literal implementado |
| H-7.2 (MEDIO): sin enlace a evidencia ( Rules Applied §2) | evidence_summary con trace_id + phenomenon_id |
| H-7.2 (MEDIO): sector undefined interpolado | sectorLabel con validación |
| H-7.2 (MEDIO): phenomenon_name arbitrario | driver phenomenon = mismo que max-risk |
| H-7.2 (MEDIO): recommendation_intro divergente | Reutiliza array recommendations de PASO-4 |
