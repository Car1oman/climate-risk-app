# BACKEND CONTRACTS — API y Contratos de Servidor

**Fuente de verdad:** `project-memory/MASTER_REFACTOR_PLAN.md` §7.4  
**Status:** Contratos actuales documentados; target contracts definidos para migración

---

## Endpoints actuales

| Endpoint | Auth | Cache | Notas |
|----------|------|-------|-------|
| `GET /api/climate` | No | 5 min | Open-Meteo en vivo |
| `GET /api/climate-cells/query` | No | 5 min | climate_cells + interpretación |
| `GET /api/climate-risks/lookup` | No | No | climate_cells raw + periodos (keys incorrectas) |
| `GET /api/external-risks/lookup` | No | 5 min | GRI Oxford |
| `POST /api/climate-cells/upload` | Auth + rate limit | No | ETL |
| `POST /v2/climate-risk-analysis` | Auth | No | Pipeline completo (6 capas) |
| `POST /api/ai` | Auth + rate limit | No | Gemini (SIN guardrails — P0) |

---

## Problema crítico en /api/climate-risks/lookup

```javascript
// climate.js:417-431 — PERIOD_MAPS inline incorrecto
// Devuelve: ['historico', 'corto', 'mediano']
// Debería: ['historico', 'corto_plazo', 'mediano_plazo'] o keys nuevas

// Este endpoint tiene su propio mapeo que NO coincide con el resto del sistema.
// Fix en P1.4: unificar con HORIZON_REGISTRY
```

---

## Contrato target: ClimateAnalysisResponse

```typescript
// server/types/api-contracts.ts (nuevo en P1+)
interface ClimateAnalysisResponse {
  meta: {
    requestId: string;
    analysisDate: string;
    location: { lat: number; lon: number; label: string; region: 'costa' | 'sierra' | 'selva' };
    sector: string;
    dataAvailability: Record<ClimateHorizon, boolean>;
  };

  timeline: {
    baseline: ClassifiedHazard[];
    near_term:   { ssp245: ClassifiedHazard[]; ssp585: ClassifiedHazard[] };
    mid_century: { ssp245: ClassifiedHazard[]; ssp585: ClassifiedHazard[] };
    end_century: {
      ssp245: ClassifiedHazard[];
      ssp585: ClassifiedHazard[];
      isExtrapolated: true;   // invariante — siempre true
      disclaimer: string;
    };
  };

  narrative: ExecutiveNarrative;
  governance: GovernanceMetadata;
}
// Eliminar: signals[] flat, risks[] flat, proyecciones hardcodeadas en narrative
```

---

## Contrato target: AI Enrichment

```
POST /api/ai/enrich   (reemplaza POST /api/ai — P0)
Auth: requireAuth
Body: { context: AIEnrichmentContext, question: string }
Response: {
  enrichment: AIEnrichmentResponse | null,
  fallbackUsed: boolean,
  validationWarnings: string[]
}
```

---

## Archivos backend críticos

| Archivo | Estado | Sprint |
|---------|--------|--------|
| `server/routes/climate.js` | Activo — PERIOD_MAPS incorrecto | P1.4 |
| `server/routes/ai.js` | Activo — sin guardrails | P0.1-P0.3 |
| `server/ai/scientificValidator.ts` | No existe | P0.2 |
| `server/layers/Layer1_ClimateDataFusion.js` | Activo | P1+ |
| `server/layers/Layer2_SignalEngine.js` | Activo | P2+ |
| `server/layers/Layer3_BusinessRiskEngine.js` | Activo | P2+ |
| `server/layers/Layer5_AdaptationEngine.js` | Activo | P2+ |
| `server/scientific/projection.js` | Activo — far_term hardcodeado | P1.5 |
| `server/scientific/governance.js` | Activo — OK | mantener |
| `server/scientific/domain.js` | Activo — OK | mantener |
| `server/scientific/historical.js` | Activo — OK | mantener |

---

## Supabase — Disponibilidad de datos

```
Tabla: climate_cells (JSONB)
RPC: get_nearest_climate_cell(lat, lon, horizon_key)

Horizontes disponibles en DB:
  ✅ historical (1981-2014 observado)
  ✅ ensemble-all-ssp245_2020-2039
  ✅ ensemble-all-ssp245_2040-2059
  ✅ ensemble-all-ssp585_2020-2039
  ✅ ensemble-all-ssp585_2040-2059
  ❌ ensemble-all-sspX_2060-2079 (NO EXISTE — usamos hardcoded IPCC AR6)
  ❌ DCPP decadal (0-10 años) (NO EXISTE — P4.3 roadmap)
```

---

## Clasificación de riesgo — problema de duplicación

`classifyRiskLevel` existe en dos lugares:
1. `climate.js:74-87` — umbrales absolutos (txx > 38°C = alto)
2. Layer2 signal thresholds — lógica paralela

Problema: no hay single source of truth.  
Fix: P3.3 — unificar en un servicio.
