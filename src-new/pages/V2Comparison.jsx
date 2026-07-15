import * as React from "react";

const COMPARISONS = [
  {
    aspect: "Arquitectura",
    v1: "Pipeline monolítico en una sola función (climate.js)",
    v2: "7 etapas desacopladas con contratos E/S explícitos y orquestador dedicado",
  },
  {
    aspect: "Manejo de errores",
    v1: "Errores silenciosos vía Promise.allSettled — fallos ocultos",
    v2: "Errores tipados por etapa, trazables a etapa exacta, nunca silenciosos",
  },
  {
    aspect: "Modelo de confianza",
    v1: "Score de confianza único y opaco (0-1 colapsado)",
    v2: "Bidimensional: source_quality (5 componentes) + signal_strength (4 componentes)",
  },
  {
    aspect: "Selección de fuentes",
    v1: "Promedio ponderado entre múltiples fuentes",
    v2: "Una fuente autoritativa por dominio, otras como validación",
  },
  {
    aspect: "Cobertura espacial",
    v1: "Sin distinción — genera valores aunque no haya cobertura real",
    v2: "Distinción explícita entre 'sin cobertura' y 'aproximable por vecino'",
  },
  {
    aspect: "Artefactos intermedios",
    v1: "Ninguno — solo el resultado final en DB",
    v2: "EvidenceArtifact auto-contenido v2.0 con todas las transformaciones",
  },
  {
    aspect: "Fórmula de riesgo",
    v1: "Probabilidad × Impacto (sin capacidad adaptativa)",
    v2: "(Probabilidad × Impacto) / Capacidad Adaptativa (multi-indicador)",
  },
  {
    aspect: "Trazabilidad",
    v1: "Solo el resultado final — no hay registro de transformaciones",
    v2: "Traza completa por etapa con reglas aplicadas, errores y confianza",
  },
  {
    aspect: "UI",
    v1: "Vista única mezclando datos técnicos y ejecutivos",
    v2: "Dual: Ejecutivo (semáforos, narrativa) + Analista (confianza, fuentes, trazabilidad)",
  },
  {
    aspect: "Validación",
    v1: "Sin validación de frontera — datos crudos pasan directamente",
    v2: "Validación en cada etapa con schemas Zod y detectores de anomalías",
  },
  {
    aspect: "Riesgos de transición",
    v1: "No contemplados",
    v2: "4 tipos (regulatorio/mercado/tecnología/reputacional) por perfil sectorial",
  },
  {
    aspect: "Tests",
    v1: "Sin tests automatizados del pipeline",
    v2: "34 tests (unit + integración + API + frontend + transición), 0 fallos",
  },
];

export function V2Comparison() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Comparación: v1 vs v2
        </h1>
        <p className="text-sm text-muted-foreground">
          Diferencias arquitectónicas entre el pipeline actual y la reconstrucción
        </p>
      </div>

      <div className="space-y-3">
        {COMPARISONS.map((item) => (
          <div
            key={item.aspect}
            className="grid grid-cols-[140px_1fr_1fr] gap-4 p-4 rounded-xl border border-border bg-card/50 hover:bg-card transition-colors"
          >
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">
              {item.aspect}
            </div>
            <div className="text-xs text-muted-foreground/70 bg-muted/30 rounded-lg p-3 leading-relaxed">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 mr-2">
                v1
              </span>
              {item.v1}
            </div>
            <div className="text-xs text-foreground/80 bg-primary/5 rounded-lg p-3 leading-relaxed">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary mr-2">
                v2
              </span>
              {item.v2}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <h2 className="text-sm font-semibold text-primary mb-2">Resumen</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          La v2 reemplaza un pipeline monolítico sin trazabilidad ni validación por
          7 etapas desacopladas con contratos explícitos, errores tipados, confianza
          bidimensional, y UI dual. Cada transformación es trazable y auditable.
          El sistema actual (v1) se mantiene como referencia funcional — no se modifica.
        </p>
      </div>
    </div>
  );
}
