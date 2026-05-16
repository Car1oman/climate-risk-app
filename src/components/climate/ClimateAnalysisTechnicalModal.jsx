// @ts-nocheck
import { useState } from "react";
import {
  FlaskConical,
  Info,
  Database,
  Calculator,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  Activity,
  Shield,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ── Mapas de nombres en lenguaje humano ──────────────────────────────────────

const VARIABLE_NAMES = {
  hd35:         "Días con temperatura máxima superior a 35°C",
  hd40:         "Días con temperatura máxima superior a 40°C",
  tr:           "Noches tropicales (temperatura mínima nocturna superior a 20°C)",
  cdd:          "Días consecutivos sin lluvia significativa",
  prpercnt:     "Variación porcentual de la lluvia total anual",
  rx5day:       "Lluvia máxima acumulada en 5 días consecutivos",
  rx1day:       "Lluvia máxima registrada en un solo día",
  tas:          "Temperatura media del aire",
  gri_flood:    "Probabilidad de inundación fluvial",
  gri_drought:  "Probabilidad de sequía hídrica",
  gri_heat:     "Probabilidad de calor extremo",
  gri_landslide:"Probabilidad de deslizamiento",
};

const VARIABLE_UNITS = {
  hd35: "días/año", hd40: "días/año", tr: "noches/año",
  cdd: "días", prpercnt: "%", rx5day: "mm", rx1day: "mm", tas: "°C",
  gri_flood: "probabilidad (0–1)", gri_drought: "probabilidad (0–1)",
  gri_heat: "probabilidad (0–1)", gri_landslide: "probabilidad (0–1)",
};

const SIGNAL_TYPE_NAMES = {
  extreme_heat:    "Calor extremo — días con temperatura superior a 35°C",
  severe_heat:     "Calor severo — días con temperatura superior a 40°C",
  tropical_nights: "Noches tropicales — temperatura nocturna superior a 20°C",
  drought:         "Sequía — días consecutivos sin lluvia significativa",
  extreme_rain:    "Lluvia extrema — precipitación máxima en 5 días",
  temp_increase:   "Aumento de temperatura media anual",
  flood_risk:      "Riesgo de inundación fluvial",
};

const SIGNAL_TYPE_IMPACT = {
  extreme_heat:
    "Más días sobre 35°C incrementa el consumo energético para refrigeración, reduce la afluencia de clientes y aumenta el riesgo de daño a productos sensibles al calor.",
  severe_heat:
    "Temperaturas superiores a 40°C pueden afectar la cadena de frío, provocar averías en equipos de climatización y reducir la productividad del personal.",
  tropical_nights:
    "Las noches cálidas (>20°C) impiden la recuperación térmica natural del local, incrementando los costos de climatización nocturna y el desgaste de equipos.",
  drought:
    "La escasez hídrica afecta las operaciones de limpieza, cocinas y secciones de frescos, y puede interrumpir la cadena de suministro de productos agrícolas.",
  extreme_rain:
    "Las lluvias intensas generan riesgo de inundación del local, daño al inventario, corte de acceso por inundación de vías e interrupción de proveedores.",
  temp_increase:
    "El aumento sostenido de temperatura media incrementa los costos operativos anuales de climatización y reduce la vida útil de equipos de refrigeración.",
  flood_risk:
    "Una alta probabilidad de inundación eleva el riesgo de cierre operativo, pérdida de inventario y daño estructural al local.",
};

const THRESHOLD_HUMAN = {
  "IPCC AR6 WG1 Ch.11":    "Sexto Informe del IPCC — Capítulo sobre eventos de calor extremo",
  "IPCC AR6 WG1 Ch.11.3":  "Sexto Informe del IPCC — Capítulo sobre noches tropicales",
  "IPCC AR6 WG1 Ch.11.6":  "Sexto Informe del IPCC — Capítulo sobre sequías",
  "IPCC AR6 WG1 Ch.11.4":  "Sexto Informe del IPCC — Capítulo sobre lluvia extrema",
  "IPCC AR6 WG2 Ch.4":     "Sexto Informe del IPCC — Capítulo sobre el ciclo del agua",
  "IPCC AR6 WG1 SPM":      "Sexto Informe del IPCC — Resumen para responsables de política",
  "WMO State of Global Climate 2023": "Organización Meteorológica Mundial — Informe de Estado del Clima 2023",
  "Paris Agreement 1.5C":  "Acuerdo de París — umbral de +1.5°C de calentamiento global",
  "WRI Aqueduct":           "Índice global de riesgo de inundación y sequía (Instituto de Recursos Mundiales)",
};

const SOURCE_HUMAN = {
  "CMIP6 / climate_cells":           "Proyecciones del conjunto global de 49+ modelos climáticos (WCRP)",
  "GRI Infrastructure Resilience":   "Base internacional de exposición climática para infraestructura (GRI, Oxford)",
  "Open-Meteo CMIP6":                "Variables climáticas derivadas de CMIP6 (fuente de respaldo)",
  "climate_cells":                   "Proyecciones del conjunto global de 49+ modelos climáticos (WCRP)",
  "GRI":                             "Base internacional de exposición climática para infraestructura (GRI, Oxford)",
  "Open-Meteo":                      "Variables climáticas derivadas de CMIP6 (fuente de respaldo)",
};

const CONFIDENCE_LABEL = {
  high:   "Alta — dato del ensemble CMIP6 con múltiples modelos concordantes",
  medium: "Media — dato del índice GRI Oxford o derivado de CMIP6",
  low:    "Baja — dato inferido por proximidad espacial",
};

const CONFIDENCE_COLOR = {
  high:   "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  low:    "text-slate-400 border-slate-500/30 bg-slate-500/10",
};

const SECTOR_LABELS = {
  retail:          "Retail / Supermercados",
  salud:           "Salud / Clínicas",
  educacion:       "Educación",
  entretenimiento: "Entretenimiento",
  otros:           "Otro sector",
};

// Componentes del score compuesto Layer 4
const SCORE_COMPONENTS = [
  {
    key: "probability",
    label: "Probabilidad de ocurrencia del peligro",
    weight: 0.30,
    explain: "Probabilidad histórica y proyectada de que el peligro ocurra en esta ubicación. Proviene del índice GRI Oxford.",
  },
  {
    key: "intensity",
    label: "Intensidad del cambio proyectado",
    weight: 0.25,
    explain: "Magnitud del cambio entre el valor proyectado y el histórico (1980–2014). Proviene de los índices CMIP6.",
  },
  {
    key: "exposure",
    label: "Nivel de exposición del sector",
    weight: 0.25,
    explain: "Cuán expuesto está el sector seleccionado a este tipo de peligro. Retail tiene exposición alta (1.0).",
  },
  {
    key: "sensitivity",
    label: "Sensibilidad operacional del sector",
    weight: 0.10,
    explain: "Qué tan sensibles son las operaciones del sector ante este peligro, según impactos históricos documentados.",
  },
  {
    key: "horizon_factor",
    label: "Factor de urgencia temporal",
    weight: 0.10,
    explain: "Horizonte de tiempo: corto plazo (2020–2039) tiene factor 1.0 (más urgente), mediano (2040–2059) tiene 0.75.",
  },
];

const VERIFIABLE_SOURCES = [
  {
    name: "Conjunto global de 49+ modelos climáticos (CMIP6, WCRP)",
    role: "Proyecciones históricas (1980–2014) y futuras (2020–2039, 2040–2059) de todas las variables climáticas analizadas.",
    url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",
  },
  {
    name: "Base internacional de exposición climática para infraestructura (GRI, Oxford)",
    role: "Probabilidades de amenaza (inundación, sequía, calor extremo, deslizamiento) a ~1 km de resolución.",
    url: "https://global.infrastructureresilience.org",
  },
  {
    name: "Sexto Informe del IPCC — Grupos de Trabajo I y II (AR6)",
    role: "Marco metodológico, umbrales de señales y criterios de evaluación de riesgo climático.",
    url: "https://www.ipcc.ch/assessment-report/ar6/",
  },
  {
    name: "Marco internacional de divulgación de riesgos climáticos (TCFD)",
    role: "Rangos de impacto financiero sectorial por tipo de riesgo físico agudo.",
    url: "https://www.tcfdhub.org/",
  },
  {
    name: "Índice de riesgo de inundación y sequía (WRI Aqueduct)",
    role: "Probabilidad de inundación fluvial y costera por punto geográfico a escala global.",
    url: "https://www.wri.org/aqueduct",
  },
  {
    name: "Variables climáticas derivadas de CMIP6 vía Open-Meteo",
    role: "Fuente de respaldo cuando no hay celda climática disponible a menos de 50 km del punto.",
    url: "https://open-meteo.com/en/docs/climate-api",
  },
  {
    name: "Escenario climático intermedio de emisiones (SSP2-4.5)",
    role: "Proyecta un calentamiento de +2.1°C a +3.5°C para 2100 bajo esfuerzo moderado de reducción de emisiones.",
    url: "https://www.ipcc.ch/report/ar6/wg1/",
  },
  {
    name: "Escenario climático pesimista de emisiones (SSP5-8.5)",
    role: "Proyecta un calentamiento de +3.3°C a +5.7°C para 2100 bajo emisiones muy altas y sin mitigación.",
    url: "https://www.ipcc.ch/report/ar6/wg1/",
  },
];

// ── Utilidades ────────────────────────────────────────────────────────────────

function fmtUSD(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v}`;
}

function TabButton({ label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap",
        active
          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

function NoteBox({ children }) {
  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex gap-2">
      <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function CalcBox({ children }) {
  return (
    <div className="bg-muted/50 border border-border rounded-lg p-3 font-mono text-xs text-center space-y-1">
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold text-foreground">{children}</p>;
}

// ── Pestaña: Score compuesto ──────────────────────────────────────────────────

function TabCompositeScore({ analysis }) {
  const metrics    = analysis?.narrative?.key_metrics ?? {};
  const risks      = analysis?.risks ?? [];
  const metadata   = analysis?.metadata ?? {};
  const topRisk    = risks[0];
  const scoreRaw   = metrics.composite_score_top ?? topRisk?.composite_score;
  const score      = scoreRaw != null ? Math.round(scoreRaw * 100) : null;
  const components = topRisk?.score_components ?? {};
  const urgency    = metrics.urgencia_top_riesgo ?? topRisk?.urgency ?? "—";
  const sector     = SECTOR_LABELS[metadata.sector] ?? metadata.sector ?? "—";
  const scenario   = metadata.scenario ?? "—";

  const urgencyColor = {
    "crítica": "text-red-400", alta: "text-orange-400",
    media: "text-yellow-400", baja: "text-emerald-400",
  }[urgency] ?? "text-foreground";

  // Calculate per-component contributions
  const rows = SCORE_COMPONENTS.map((c) => {
    const raw = components[c.key] ?? components[c.key.replace("_factor", "")] ?? null;
    const val = raw != null ? Math.round(raw * 100) : null;
    const contrib = raw != null ? (raw * c.weight * 100).toFixed(1) : null;
    return { ...c, val, contrib };
  });

  const topComponent = rows
    .filter((r) => r.contrib != null)
    .reduce(
      (a, b) => (parseFloat(b.contrib) > parseFloat(a.contrib ?? "-1") ? b : a),
      rows[0]
    );

  const totalCalc = rows
    .filter((r) => r.contrib != null)
    .reduce((s, r) => s + parseFloat(r.contrib), 0)
    .toFixed(1);

  return (
    <div className="space-y-5">
      {/* Resultado */}
      <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">Score de riesgo climático geoespacial</p>
        {score != null ? (
          <p className={cn("text-4xl font-bold", urgencyColor)}>
            {score}
            <span className="text-base text-muted-foreground font-normal">/100</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Sin score disponible</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Urgencia: <span className={cn("font-semibold", urgencyColor)}>{urgency}</span>{" "}
          — Sector: {sector} — Escenario:{" "}
          {scenario === "pesimista"
            ? "Emisiones muy altas (SSP5-8.5)"
            : scenario === "moderado"
            ? "Emisiones moderadas (SSP2-4.5)"
            : scenario}
        </p>
      </div>

      {/* Tabla de componentes */}
      <div className="space-y-2">
        <SectionLabel>
          Cómo se suma el score{score != null ? ` de ${score}/100` : ""}:
        </SectionLabel>
        <p className="text-xs text-muted-foreground">
          El score es la suma de cinco componentes. Cada componente tiene un valor (0–100)
          y un peso de importancia. Su contribución es: valor × peso.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Componente</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Valor</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Peso</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Aporte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground leading-tight">{row.label}</td>
                  <td className="px-3 py-2 text-center font-mono">
                    {row.val != null ? (
                      <span className="font-semibold text-blue-400">{row.val}/100</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                    {(row.weight * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.contrib != null ? (
                      <span className="font-semibold text-sky-400">{row.contrib} pts</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={3} className="px-3 py-2 font-semibold text-foreground">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-bold font-mono">
                  <span className={urgencyColor}>{score ?? totalCalc}/100</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Fórmula */}
      <CalcBox>
        <p className="text-muted-foreground not-italic font-sans text-[11px]">
          Score = (Probabilidad × 30%) + (Intensidad × 25%) + (Exposición × 25%) +
          (Sensibilidad × 10%) + (Factor temporal × 10%)
        </p>
        {score != null && (
          <p className={cn("font-bold text-base not-italic font-sans", urgencyColor)}>
            = {score}/100
          </p>
        )}
      </CalcBox>

      {/* Mayor contribuyente */}
      {topComponent?.contrib != null && (
        <NoteBox>
          <span>
            <strong>
              ¿Por qué {score ?? "este score"} y no otro número?
            </strong>{" "}
            El componente que más eleva el score es{" "}
            <strong>{topComponent.label}</strong>, que aporta{" "}
            <strong>{topComponent.contrib} puntos</strong> al total.{" "}
            {topComponent.explain}
          </span>
        </NoteBox>
      )}
    </div>
  );
}

// ── Pestaña: Impacto Financiero ───────────────────────────────────────────────

function TabFinancialImpact({ analysis }) {
  const metrics  = analysis?.narrative?.key_metrics ?? {};
  const risks    = analysis?.risks ?? [];
  const metadata = analysis?.metadata ?? {};
  const sector   = SECTOR_LABELS[metadata.sector] ?? metadata.sector ?? "No especificado";
  const scenario = metadata.scenario ?? "—";
  const minUSD   = metrics.impacto_financiero_min;
  const maxUSD   = metrics.impacto_financiero_max;

  const riskRanges = risks.filter((r) => r.financial_impact_range?.min_usd != null).slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Rango total */}
      {minUSD != null && (
        <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">
            Impacto financiero potencial — sector {sector}
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmtUSD(minUSD)} – {fmtUSD(maxUSD)}
            <span className="text-xs font-normal text-muted-foreground ml-1">/año</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Estimación para el sector bajo el escenario{" "}
            {scenario === "pesimista"
              ? "de emisiones muy altas (SSP5-8.5)"
              : scenario === "moderado"
              ? "de emisiones moderadas (SSP2-4.5)"
              : scenario}
            .
          </p>
        </div>
      )}

      {/* Cómo se obtiene */}
      <div className="space-y-2">
        <SectionLabel>
          Cómo se obtiene el rango{minUSD != null ? ` de ${fmtUSD(minUSD)} – ${fmtUSD(maxUSD)}` : ""}:
        </SectionLabel>
        <p className="text-xs text-muted-foreground">
          Cada señal climática activa se mapea a un rango de pérdida anual en USD según el
          tipo de impacto que produce en el sector. Los rangos individuales se suman para
          obtener el total.
        </p>
      </div>

      {riskRanges.length > 0 ? (
        <div className="space-y-3">
          {riskRanges.map((r, i) => {
            const sType = r.signal?.signalType ?? r.risk_type;
            const name = SIGNAL_TYPE_NAMES[sType] ?? sType ?? `Riesgo #${i + 1}`;
            const impact = SIGNAL_TYPE_IMPACT[sType] ?? "Este riesgo genera pérdidas operativas directas e indirectas.";
            return (
              <div key={i} className="bg-muted/20 border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{name}</p>
                  <span className="text-sm font-bold text-emerald-400 flex-shrink-0 whitespace-nowrap">
                    {fmtUSD(r.financial_impact_range.min_usd)} –{" "}
                    {fmtUSD(r.financial_impact_range.max_usd)}/año
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{impact}</p>
                {r.adaptations?.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Medida recomendada:{" "}
                    <span className="font-semibold text-foreground">
                      {r.adaptations[0].measure}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          No hay datos de impacto por riesgo disponibles.
        </p>
      )}

      {minUSD != null && riskRanges.length > 1 && (
        <CalcBox>
          <p className="text-muted-foreground not-italic font-sans text-[11px]">
            Suma de rangos individuales por señal activa
          </p>
          <p className="text-emerald-400 font-bold text-base not-italic font-sans">
            Total: {fmtUSD(minUSD)} – {fmtUSD(maxUSD)}/año
          </p>
        </CalcBox>
      )}

      <NoteBox>
        Este rango es una estimación sectorial de referencia. No usa datos financieros
        del activo (ventas, empleados, área). El rango máximo asume que múltiples riesgos
        se materializan en el mismo año — escenario de baja probabilidad. Para una estimación
        financiera del activo específico, use el modelo H×E×I desde la vista de detalle.
      </NoteBox>
    </div>
  );
}

// ── Pestaña: Señales Climáticas ───────────────────────────────────────────────

function TabSignals({ analysis }) {
  const signalsData = analysis?.signals ?? {};
  const list        = signalsData.signals ?? [];
  const count       = signalsData.signals_count ?? list.length;
  const metadata    = analysis?.metadata ?? {};
  const scenario    = metadata.scenario ?? "—";

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Cada señal muestra qué variable cambió, cuánto cambió respecto al histórico
        (1980–2014) y si el cambio supera el umbral internacional que activa la alerta.
      </p>

      {list.length > 0 ? (
        <div className="space-y-4">
          {list.map((signal, idx) => {
            const sType    = signal.signalType ?? signal.signal_type;
            const name     = SIGNAL_TYPE_NAMES[sType] ?? sType ?? `Señal ${idx + 1}`;
            const impact   = SIGNAL_TYPE_IMPACT[sType] ?? "";
            const varKey   = signal.source_traceability?.variable_key ?? signal.variable_key;
            const varName  = VARIABLE_NAMES[varKey] ?? varKey ?? "Variable climática";
            const unit     = VARIABLE_UNITS[varKey] ?? "";
            const hist     = signal.historical;
            const proj     = signal.projected;
            const delta    = signal.delta;
            const conf     = signal.confidence ?? "low";
            const confLabel = CONFIDENCE_LABEL[conf] ?? conf;
            const confColor = CONFIDENCE_COLOR[conf] ?? CONFIDENCE_COLOR.low;

            const rawThreshold =
              signal.source_traceability?.threshold_applied ??
              signal.threshold_reference ??
              signal.threshold ??
              null;
            const rawRef =
              signal.source_traceability?.reference ??
              signal.threshold_reference ??
              null;
            const thresholdHuman = rawRef ? (THRESHOLD_HUMAN[rawRef] ?? rawRef) : null;

            const rawSource = signal.source_traceability?.source ?? signal.source ?? null;
            const sourceHuman = rawSource ? (SOURCE_HUMAN[rawSource] ?? rawSource) : null;

            const exceeds = signal.exceeds_threshold ?? (conf === "high" || conf === "medium");

            return (
              <div
                key={idx}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Header */}
                <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{name}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {exceeds ? (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-orange-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Señal activa
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                        <XCircle className="w-3.5 h-3.5" />
                        Sin señal
                      </div>
                    )}
                  </div>
                </div>

                {/* Contenido */}
                <div className="px-4 py-3 space-y-3">
                  {/* Variable y valores */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Variable analizada
                    </p>
                    <p className="text-xs text-foreground">{varName}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        Histórico
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {hist != null ? `${typeof hist === "number" ? hist.toFixed(1) : hist}` : "—"}
                      </p>
                      {unit && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{unit}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">(1980–2014)</p>
                    </div>

                    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        Proyectado
                      </p>
                      <p className="text-sm font-bold text-orange-400">
                        {proj != null ? `${typeof proj === "number" ? proj.toFixed(1) : proj}` : "—"}
                      </p>
                      {unit && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{unit}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">(2020–2039)</p>
                    </div>

                    <div className="bg-muted/40 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        Cambio
                      </p>
                      <p
                        className={cn(
                          "text-sm font-bold",
                          delta != null && delta > 0 ? "text-orange-400" : "text-sky-400"
                        )}
                      >
                        {delta != null
                          ? `${delta > 0 ? "+" : ""}${typeof delta === "number" ? delta.toFixed(1) : delta}`
                          : "—"}
                      </p>
                      {unit && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{unit}</p>
                      )}
                    </div>
                  </div>

                  {/* Umbral */}
                  {rawThreshold && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Umbral de activación
                      </p>
                      <div className="bg-muted/30 border border-border rounded px-3 py-2 space-y-0.5">
                        <p className="text-xs text-foreground font-mono">{rawThreshold}</p>
                        {thresholdHuman && (
                          <p className="text-[11px] text-muted-foreground">
                            Fuente: {thresholdHuman}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resultado */}
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2 flex items-center gap-2",
                      exceeds
                        ? "bg-orange-500/10 border-orange-500/30"
                        : "bg-muted/30 border-border"
                    )}
                  >
                    {exceeds ? (
                      <CheckCircle2 className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <p className="text-xs">
                      {exceeds ? (
                        <>
                          <span className="font-semibold text-orange-400">
                            El cambio supera el umbral
                          </span>
                          <span className="text-muted-foreground"> → señal activa</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          El cambio no supera el umbral → sin señal
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Por qué importa */}
                  {impact && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Por qué importa operacionalmente
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{impact}</p>
                    </div>
                  )}

                  {/* Confianza y fuente */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] py-0.5 px-2 border", confColor)}
                    >
                      Confianza: {confLabel}
                    </Badge>
                    {sourceHuman && (
                      <span className="text-[10px] text-muted-foreground">
                        Fuente: {sourceHuman}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          No se detectaron señales climáticas para esta ubicación bajo el escenario{" "}
          {scenario === "pesimista" ? "de emisiones muy altas" : "moderado"}.
        </p>
      )}

      <NoteBox>
        Las señales muestran tendencias climáticas proyectadas, no eventos con fecha y magnitud
        exactas. Una señal activa significa que el ensemble de modelos muestra un cambio que supera
        el umbral internacional de relevancia, no que el evento ya esté ocurriendo.
      </NoteBox>
    </div>
  );
}

// ── Pestaña: Fuentes ──────────────────────────────────────────────────────────

function TabSources() {
  return (
    <div className="space-y-3">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          Cada número tiene una fuente verificable
        </p>
        <p className="text-xs text-muted-foreground">
          Los valores históricos y proyectados provienen de modelos climáticos internacionales.
          Los umbrales de señal siguen estándares del IPCC y la Organización Meteorológica Mundial.
          Los rangos de impacto financiero siguen el marco TCFD.
        </p>
      </div>

      <div className="space-y-2">
        {VERIFIABLE_SOURCES.map((src) => (
          <div key={src.name} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">{src.name}</p>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-blue-500 hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">{src.role}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
            Interpretación técnica
          </p>
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed mt-0.5">
            Los resultados son estimaciones probabilísticas bajo escenarios de emisiones moderado
            y pesimista — no son predicciones exactas. Para decisiones de inversión, ingeniería o
            cumplimiento regulatorio, complemente con estudios locales especializados y datos de
            estaciones meteorológicas locales cuando estén disponibles.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * @param {{ analysis: object }} props
 */
export default function ClimateAnalysisTechnicalModal({ analysis }) {
  const [tab, setTab] = useState("score");

  const metrics  = analysis?.narrative?.key_metrics ?? {};
  const signals  = analysis?.signals ?? {};
  const risks    = analysis?.risks ?? [];

  const scoreRaw = metrics.composite_score_top ?? risks[0]?.composite_score;
  const score    = scoreRaw != null ? Math.round(scoreRaw * 100) : null;
  const minUSD   = metrics.impacto_financiero_min;
  const maxUSD   = metrics.impacto_financiero_max;
  const count    = signals.signals_count ?? (signals.signals ?? []).length;

  const tabs = [
    {
      id: "score",
      label: score != null ? `Score: ${score}/100` : "Score de Riesgo",
      icon: Calculator,
    },
    {
      id: "financial",
      label:
        minUSD != null
          ? `${fmtUSD(minUSD)}–${fmtUSD(maxUSD)}/año`
          : "Impacto Financiero",
      icon: DollarSign,
    },
    {
      id: "signals",
      label: count > 0 ? `${count} señal${count !== 1 ? "es" : ""}` : "Señales",
      icon: Activity,
    },
    { id: "sources", label: "Fuentes", icon: Database },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
          <FlaskConical className="w-3.5 h-3.5" />
          Ver detalle técnico
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="w-4 h-4 text-blue-500" />
            ¿Cómo se obtuvo este resultado?
          </DialogTitle>
          <DialogDescription>
            Cálculo con los valores reales de esta ubicación. Cada número indica qué variable
            se usó, qué valor tenía, contra qué se comparó y qué resultado produjo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {tabs.map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              icon={t.icon}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
            />
          ))}
        </div>

        <div className="mt-1">
          {tab === "score"     && <TabCompositeScore  analysis={analysis} />}
          {tab === "financial" && <TabFinancialImpact analysis={analysis} />}
          {tab === "signals"   && <TabSignals         analysis={analysis} />}
          {tab === "sources"   && <TabSources />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
