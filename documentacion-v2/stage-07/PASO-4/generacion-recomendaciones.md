# PASO-4 — Generación de Recomendaciones

**Documento de Arquitectura, Trazabilidad y Gobernanza**

| Campo | Valor |
|---|---|
| **Componente** | `buildRecommendations()`, `lookupPhysicalMeasure()`, `lookupTransitionMeasure()` |
| **Ubicación** | `pipeline/stages/07-presentation/index.js:417-510` |
| **Stage** | Stage 07 — Presentation (ID: 7) |
| **Versión del documento** | 1.0.0 |
| **Fecha** | 2026-07-17 |
| **Propósito** | Documentación de la generación de recomendaciones personalizadas por fenómeno×sector, priorizadas por risk_score_raw, con fuente en Anexo 10.2 |

---

## 1. Resumen Ejecutivo

buildRecommendations() genera recomendaciones de adaptación climática personalizadas usando adaptation-measures.json (fuente: Anexo 10.2 Catálogo de Riesgos y Medidas de Adaptación). Distingue 3 estados: "sin datos" (assessments null), "datos pero todo bajo" (assessments.length > 0, todos bajo), y "hay riesgos relevantes" (filtrados y priorizados). Las recomendaciones se capan (MAX_PHYSICAL=3, MAX_TRANSITION=2) para que "priorizadas" (contrato Behavior §1) sea literal.

---

## 2. Flujo de Decisión

```
buildRecommendations(assessments, transitionRisks, sector, phenomena)
│
├─ assessments == null?
│   └─ SÍ → "Sin datos suficientes para generar recomendaciones"
│
├─ assessments.length == 0?
│   └─ SÍ → "No se identificaron fenómenos climáticos evaluables"
│
├─ assessments.filter(risk_level ≠ bajo).length == 0?
│   └─ SÍ → "Los N fenómenos presentan riesgo bajo — mantener monitoreo"
│
└─ HAY RIESGOS RELEVANTES
    ├─ Ordenar por risk_score_raw DESCENDENTE (continuo, no solo ordinal)
    ├─ Para cada assessment relevante (máx 3):
    │   ├─ lookupPhysicalMeasure(catalog, hazardName, sector)
    │   ├─ Dedup por `${hazardName}:${measure}`
    │   └─ Formatear: "[Nivel] Fenómeno: Medida — Descripción (fuente: ...)"
    │
    └─ Para cada transition risk alta/catastrofica (máx 2):
        ├─ lookupTransitionMeasure(catalog, type, sector)
        └─ Formatear: "Riesgo de transición (tipo): Texto (fuente: ...)"
```

---

## 3. lookupPhysicalMeasure() — Prioridad de Fuentes

```javascript
lookupPhysicalMeasure(catalog, hazardName, sector) {
  const sectorSpecific = catalog.measures_by_hazard_sector?.[hazardName]?.sector_specific?.[sector];
  if (sectorSpecific && sectorSpecific.length > 0) {
    return { ...sectorSpecific[0], measure_source: "sector_catalog" };
  }
  const hazardTagged = (catalog.generic_measures || []).find(
    m => Array.isArray(m.applicable_hazards) && m.applicable_hazards.includes(hazardName)
  );
  if (hazardTagged) return { ...hazardTagged, measure_source: "generic_hazard_tagged" };
  const anyGeneric = (catalog.generic_measures || []).find(m => m.applicable_hazards === "any");
  return anyGeneric ? { ...anyGeneric, measure_source: "generic_any" } : null;
}
```

**Orden de prioridad**:

| Prioridad | Fuente | Condición | Etiqueta |
|-----------|--------|-----------|----------|
| 1 | sector_catalog | measures_by_hazard_sector[hazard].sector_specific[sector] existe | (sin etiqueta) |
| 2 | generic_hazard_tagged | generic_measures con applicable_hazards incluye este hazard | (sin etiqueta) |
| 3 | generic_any | generic_measures con applicable_hazards="any" | (sin etiqueta) |

**Nunca retorna null** si adaptation-measures.json tiene al menos una entrada "any" en generic_measures.

---

## 4. lookupTransitionMeasure() — Prioridad de Fuentes

```javascript
lookupTransitionMeasure(catalog, type, sector) {
  const sectorSpecific = catalog.transition_measures_by_type_sector?.[type]?.sector_specific?.[sector];
  if (sectorSpecific) return { ...sectorSpecific, measure_source: "sector_catalog" };
  const generic = (catalog.generic_transition_measures || [])[0];
  return generic ? { ...generic, measure_source: "generic_any" } : null;
}
```

**Mismo orden de prioridad** que lookupPhysicalMeasure. El fallback genérico NO intenta matching por tipo (regulatory vs. market) — se documenta como catch-all único.

---

## 5. Cobertura Sectorial (adaptation-measures.json)

| Sector | Cobertura física | Cobertura transición | Fuente |
|--------|:----------------:|:--------------------:|--------|
| retail | Sí (ola_de_calor, inundacion) | Sí (regulatory, market, reputational) | Anexo 10.2 Cat. Medidas / Cat. Riesgos |
| finance | Sí (inundacion) | Sí (regulatory, market, technology) | Anexo 10.2 Cat. Medidas / Cat. Riesgos |
| agriculture | No (generic_measures) | No (generic_transition_measures) | Anexo 10.2 "Todas las plataformas" |
| energy | No (generic_measures) | No (generic_transition_measures) | Anexo 10.2 "Todas las plataformas" |
| infrastructure | No (generic_measures) | No (generic_transition_measures) | Anexo 10.2 "Todas las plataformas" |

**Gap declarado**: agriculture/energy/infrastructure no tienen filas específicas en el Anexo 10.2. Reciben measures etiquetadas "Todas las plataformas" — genuinamente sector-agnósticas por diseño del documento fuente.

---

## 6. Priorización (H-7.3 punto #5)

**Riesgos físicos**: Se ordenan por `risk_score_raw` descendente (continuo, fórmula ISO 31000 P×I/CA de Stage 6), no solo por `risk_level` (ordinal). Un "medio" con score alto por alta probabilidad puede superar en prioridad a un "alto" con score menor.

**Riesgos de transición**: Se ordenan por `signal_strength` descendente.

**Límites editoriales** (MAX_PHYSICAL_RECOMMENDATIONS=3, MAX_TRANSITION_RECOMMENDATIONS=2): Son un límite editorial, no una constante de calibración. Documentado como tal en vez de implícito.

---

## 7. Formato de Cada Recomendación

**Física**: `[Nivel] Fenómeno: Medida — Descripción (medida genérica — sin catálogo sectorial específico) (fuente: Anexo 10.2 Cat. Medidas — Sector / Medida).`

**Transición**: `Riesgo de transición (tipo): Texto (medida genérica — sin catálogo sectorial específico) (fuente: Anexo 10.2 Cat. Riesgos — Sector / Tipo).`

La etiqueta "(medida genérica...)" se agrega cuando measure_source ≠ "sector_catalog", indicando al usuario que la medida no es específica de su sector.

---

## 8. Trazabilidad

| Hallazgo | Resolución |
|----------|------------|
| H-7.3 (MEDIO): textos estáticos hardcodeados | adaptation-measures.json con Anexo 10.2 como fuente |
| H-7.3 (MEDIO): no personalizaba por sector | lookupPhysicalMeasure() y lookupTransitionMeasure() con sector |
| H-7.3 (MEDIO): no priorizaba por magnitud real | Ordenamiento por risk_score_raw / signal_strength descendente |
| H-7.3 (MEDIO): no distinguía "sin datos" de "todo bajo" | 3 branches explícitos en buildRecommendations() |
| H-7.3 (MEDIO): MAX_PHYSICAL=3, MAX_TRANSITION=2 | Límite editorial documentado, no calibrado |
