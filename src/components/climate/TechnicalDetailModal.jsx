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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HAZARD_LABELS, HAZARD_WEIGHTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Constantes de cálculo ─────────────────────────────────────────────────────

const CLOSURE_DAYS = { 0: 0, 1: 3, 2: 7, 3: 21, 4: 45 };

const REHAB_COST_M2 = {
  hazard_flood: 120,
  hazard_elnino: 150,
  hazard_earthquake: 350,
  hazard_landslide: 200,
  hazard_drought: 40,
};

const LEVEL_LABELS = { 0: "Nulo", 1: "Bajo", 2: "Moderado", 3: "Alto", 4: "Muy alto" };
const LEVEL_COLORS = {
  0: "text-muted-foreground",
  1: "text-emerald-400",
  2: "text-yellow-400",
  3: "text-orange-400",
  4: "text-red-400",
};

const LEVEL_EXPLAIN = {
  1: "Probabilidad baja: eventos documentados con poca frecuencia en la zona.",
  2: "Probabilidad moderada: eventos registrados con cierta frecuencia histórica.",
  3: "Probabilidad alta: zona con historial de eventos significativos documentados.",
  4: "Probabilidad muy alta: zona con eventos recurrentes y severos registrados.",
};

const LEVEL_CLOSURE_EXPLAIN = {
  0: "Sin cierre esperado.",
  1: "Estimado: 3 días de cierre operativo ante un evento de esta intensidad.",
  2: "Estimado: 7 días de cierre operativo ante un evento de esta intensidad.",
  3: "Estimado: 21 días de cierre operativo ante un evento de esta intensidad.",
  4: "Estimado: 45 días de cierre operativo ante un evento de esta intensidad.",
};

const SOURCES = [
  {
    name: "Conjunto global de 49+ modelos climáticos (CMIP6, WCRP)",
    role: "Proyecciones históricas (1980–2014) y futuras (2020–2059) para los niveles de amenaza de cada ubicación.",
    url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",
  },
  {
    name: "Base internacional de exposición climática para infraestructura (GRI, Universidad de Oxford)",
    role: "Probabilidades de amenaza (inundación, calor extremo, sequía, deslizamiento) a ~1 km de resolución espacial.",
    url: "https://global.infrastructureresilience.org",
  },
  {
    name: "Sexto Informe del IPCC — Grupos de Trabajo I y II (AR6)",
    role: "Marco metodológico de evaluación de riesgo climático y umbrales de referencia internacional.",
    url: "https://www.ipcc.ch/assessment-report/ar6/",
  },
  {
    name: "Marco internacional de divulgación de riesgos climáticos (TCFD)",
    role: "Estructura de estimación de impacto financiero por riesgo físico agudo en sectores económicos.",
    url: "https://www.tcfdhub.org/",
  },
  {
    name: "Índice de riesgo de inundación y sequía (WRI Aqueduct)",
    role: "Probabilidad de inundación fluvial y costera por punto geográfico a escala global.",
    url: "https://www.wri.org/aqueduct",
  },
  {
    name: "Variables climáticas derivadas de CMIP6 vía Open-Meteo",
    role: "Fuente de respaldo para variables climáticas cuando no hay dato local disponible a menos de 50 km.",
    url: "https://open-meteo.com/en/docs/climate-api",
  },
];

// ── Sub-componentes ───────────────────────────────────────────────────────────

const fmt = (v) =>
  `S/ ${Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

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

function CalcBox({ children }) {
  return (
    <div className="bg-muted/50 border border-border rounded-lg p-3 font-mono text-xs text-center space-y-1">
      {children}
    </div>
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

function SectionLabel({ children }) {
  return <p className="text-xs font-semibold text-foreground">{children}</p>;
}

// ── Pestaña: Score de Riesgo ──────────────────────────────────────────────────

function TabRiskScore({ asset, riskData }) {
  if (!riskData?.formula) return null;

  const { H, E, I, R } = riskData.formula;

  const hazardRows = Object.entries(HAZARD_WEIGHTS).map(([key, weight]) => {
    const level = asset[key] ?? 0;
    const contribution = (level / 4) * weight * 100;
    return { key, label: HAZARD_LABELS[key] ?? key, level, weight, contribution };
  });

  const topHazard = hazardRows.reduce(
    (a, b) => (b.contribution > a.contribution ? b : a),
    hazardRows[0]
  );

  const levelColor = {
    critico: "text-red-400",
    alto: "text-orange-400",
    medio: "text-yellow-400",
    bajo: "text-emerald-400",
  }[riskData.riskLevel] ?? "text-foreground";

  const hContrib = (H * 0.40).toFixed(1);
  const eContrib = (E * 0.30).toFixed(1);
  const iContrib = (I * 0.30).toFixed(1);

  return (
    <div className="space-y-5">
      {/* Resultado */}
      <div className="bg-muted/30 border border-border rounded-lg p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">Score de riesgo total</p>
        <p className={cn("text-4xl font-bold", levelColor)}>
          {R}
          <span className="text-base text-muted-foreground font-normal">/100</span>
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Fórmula: R = (Amenazas × 40%) + (Exposición × 30%) + (Impacto × 30%)
        </p>
      </div>

      {/* PASO 1: Amenazas */}
      <div className="space-y-2">
        <SectionLabel>Paso 1 — Amenazas climáticas (H = {H.toFixed(1)}/100)</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Cada amenaza tiene un nivel registrado (0–4) y un peso de importancia.
          El nivel se divide entre 4 para normalizarlo, luego se multiplica por el peso.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Amenaza</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Nivel</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Peso</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Aporte a H</th>
              </tr>
            </thead>
            <tbody>
              {hazardRows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("font-semibold font-mono", LEVEL_COLORS[row.level])}>
                      {row.level}/4
                    </span>
                    <span className="text-muted-foreground ml-1 text-[10px]">
                      ({LEVEL_LABELS[row.level]})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-muted-foreground">
                    {(row.weight * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className="text-muted-foreground">
                      ({row.level}/4)×{(row.weight * 100).toFixed(0)}% =
                    </span>{" "}
                    <span className={row.contribution > 0 ? "font-semibold text-sky-400" : "text-muted-foreground"}>
                      {row.contribution.toFixed(1)} pts
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={3} className="px-3 py-2 font-semibold text-foreground">
                  Total amenazas (H)
                </td>
                <td className="px-3 py-2 text-right font-bold text-sky-400 font-mono">
                  {H.toFixed(1)}/100
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* PASO 2: Exposición */}
      <div className="space-y-2">
        <SectionLabel>Paso 2 — Exposición de la tienda (E = {E.toFixed(1)}/100)</SectionLabel>
        <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Área registrada</span>
            <span className="font-semibold font-mono">
              {(asset.area_m2 ?? 1000).toLocaleString("es-PE")} m²
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tipo de tienda</span>
            <span className="font-semibold">{asset.type ?? "No especificado"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Exposición normalizada (área vs. tamaño máximo según tipo)
            </span>
            <span className="font-bold text-amber-400 font-mono">{E.toFixed(1)}/100</span>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Una tienda más grande tiene mayor exposición porque más superficie, más personal
            y más inventario quedan expuestos ante un evento climático.
          </p>
        </div>
      </div>

      {/* PASO 3: Impacto */}
      <div className="space-y-2">
        <SectionLabel>Paso 3 — Impacto financiero estimado (I = {I.toFixed(1)}/100)</SectionLabel>
        <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Pérdida total calculada</span>
            <span className="font-semibold font-mono">
              {fmt(riskData.impactBreakdown?.total ?? 0)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              Normalizado contra escala máxima de S/ 20 millones
            </span>
            <span className="font-bold text-emerald-400 font-mono">{I.toFixed(1)}/100</span>
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            El impacto financiero estimado se divide entre S/ 20M (límite de escala) para obtener
            un componente 0–100 comparable con H y E.
          </p>
        </div>
      </div>

      {/* PASO 4: Fórmula */}
      <div className="space-y-2">
        <SectionLabel>Paso 4 — Fórmula final</SectionLabel>
        <CalcBox>
          <p className="text-muted-foreground not-italic font-sans text-xs">
            R = (H × 40%) + (E × 30%) + (I × 30%)
          </p>
          <p>
            R = ({H.toFixed(1)} × 0.40) + ({E.toFixed(1)} × 0.30) + ({I.toFixed(1)} × 0.30)
          </p>
          <p>
            R = {hContrib} + {eContrib} + {iContrib}
            {" "}
            <span className={cn("font-bold text-base", levelColor)}>= {R}/100</span>
          </p>
        </CalcBox>
      </div>

      {/* Mayor contribuyente */}
      <NoteBox>
        <span>
          <strong>¿Por qué {R} y no otro número?</strong>{" "}
          {topHazard.contribution > 0 ? (
            <>
              La amenaza que más eleva el score es{" "}
              <strong>{topHazard.label}</strong> (nivel {topHazard.level}/4), que por sí
              sola aporta <strong>{topHazard.contribution.toFixed(1)} puntos</strong> al
              componente de amenazas. Si su nivel bajara a 0, el score se reduciría
              aproximadamente {(topHazard.contribution * 0.40).toFixed(1)} puntos.
            </>
          ) : (
            <>
              Todas las amenazas están en nivel 0. El score es bajo principalmente por el
              componente de exposición ({E.toFixed(1)}/100) según el tamaño y tipo de tienda.
            </>
          )}
        </span>
      </NoteBox>
    </div>
  );
}

// ── Pestaña: Impacto Financiero ───────────────────────────────────────────────

function TabFinancialImpact({ asset, riskData }) {
  if (!riskData?.impactBreakdown) return null;

  const { total, lostSales, staffCost, logisticsCost, rehabCost, closureDays } =
    riskData.impactBreakdown;

  const topKey = riskData.topRiskKey;
  const topLabel = HAZARD_LABELS[topKey] ?? topKey ?? "amenaza principal";
  const topLevel = asset[topKey] ?? 0;
  const rehabM2 = REHAB_COST_M2[topKey] ?? 120;
  const isRented = asset.condition === "alquilado";
  const area = asset.area_m2 ?? 1000;
  const employees = asset.num_employees ?? 50;
  const sales = asset.monthly_sales ?? 500000;

  const components = [
    {
      num: 1,
      title: "Ventas no generadas durante el cierre",
      formula: `S/${(sales / 1000).toFixed(0)}K/mes ÷ 30 días × ${closureDays} días de cierre`,
      value: lostSales,
      why: "Los ingresos de la tienda se detienen mientras está cerrada. Este dinero no se recupera.",
    },
    {
      num: 2,
      title: "Costos de personal durante el cierre",
      formula: `${employees} empleados × S/80/día × ${closureDays} días`,
      value: staffCost,
      why: "Los salarios fijos del personal siguen corriendo aunque la tienda no opere.",
    },
    {
      num: 3,
      title: "Costos logísticos (ruptura de cadena de suministro)",
      formula: `S/${(lostSales / 1000).toFixed(0)}K ventas perdidas × 15%`,
      value: logisticsCost,
      why: "Costo de reubicar inventario perecedero, transporte de emergencia y reactivar proveedores.",
    },
    {
      num: 4,
      title: `Rehabilitación del local dañado por ${topLabel.toLowerCase()}`,
      formula: `${area.toLocaleString("es-PE")} m² × S/${rehabM2}/m²${isRented ? " × 0.40 (local arrendado)" : " × 1.0 (local propio)"}`,
      value: rehabCost,
      why: isRented
        ? "Se aplica el 40% porque en condición de arrendamiento el propietario asume el restante 60%."
        : "Se aplica el 100% porque la tienda es propiedad propia.",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Escenario */}
      <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
        <SectionLabel>Escenario analizado</SectionLabel>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Amenaza más grave registrada</span>
          <span className="font-semibold">
            {topLabel} — nivel {topLevel}/4 ({LEVEL_LABELS[topLevel]})
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Días de cierre estimados</span>
          <span className="font-semibold font-mono">{closureDays} días</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Los días de cierre se calibraron con eventos climáticos históricos documentados de
          magnitud similar. Nivel 0 → 0 días, nivel 1 → 3 días, nivel 2 → 7 días,
          nivel 3 → 21 días, nivel 4 → 45 días.
        </p>
      </div>

      {/* Componentes */}
      <div className="space-y-2">
        <SectionLabel>Cómo se obtiene la pérdida de {fmt(total)}:</SectionLabel>
        {components.map((c) => (
          <div
            key={c.num}
            className="bg-muted/20 border border-border rounded-lg p-3 space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">
                {c.num}. {c.title}
              </p>
              <span className="text-sm font-bold text-emerald-400 flex-shrink-0">
                {fmt(c.value)}
              </span>
            </div>
            <p className="text-[11px] font-mono text-muted-foreground bg-muted/30 rounded px-2 py-1">
              {c.formula}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{c.why}</p>
          </div>
        ))}
      </div>

      {/* Total */}
      <CalcBox>
        <p className="text-muted-foreground not-italic font-sans text-[11px]">
          {fmt(lostSales)} + {fmt(staffCost)} + {fmt(logisticsCost)} + {fmt(rehabCost)}
        </p>
        <p className="text-emerald-400 font-bold text-base not-italic font-sans">
          = {fmt(total)} pérdida estimada
        </p>
      </CalcBox>

      <NoteBox>
        Esta estimación asume que el evento ocurre con la intensidad del nivel actual
        registrado ({topLabel}, nivel {topLevel}/4). No incluye pérdidas por daño a la
        reputación, efecto sobre proveedores ni inflación futura.
      </NoteBox>
    </div>
  );
}

// ── Pestaña: Amenazas ─────────────────────────────────────────────────────────

function TabHazardLevels({ asset }) {
  const hazardRows = Object.entries(HAZARD_WEIGHTS)
    .map(([key, weight]) => ({
      key,
      label: HAZARD_LABELS[key] ?? key,
      level: asset[key] ?? 0,
      weight,
    }))
    .sort((a, b) => b.level - a.level);

  const active = hazardRows.filter((r) => r.level > 0);
  const inactive = hazardRows.filter((r) => r.level === 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Los niveles (0–4) provienen del ensemble de 49+ modelos climáticos (CMIP6) y del
        índice GRI Oxford para la ubicación exacta de esta tienda. Cada nivel define cuántos
        días de cierre se estiman si ocurre el evento.
      </p>

      {active.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Amenazas con nivel registrado:</SectionLabel>
          {active.map((row) => (
            <div
              key={row.key}
              className="bg-muted/20 border border-border rounded-lg p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{row.label}</p>
                <span className={cn("text-sm font-bold font-mono", LEVEL_COLORS[row.level])}>
                  {row.level}/4 — {LEVEL_LABELS[row.level]}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{LEVEL_EXPLAIN[row.level]}</p>
              <p className="text-[11px] text-muted-foreground">{LEVEL_CLOSURE_EXPLAIN[row.level]}</p>
              <p className="text-[11px] text-muted-foreground">
                Peso en el score de amenazas:{" "}
                <span className="font-semibold">{(row.weight * 100).toFixed(0)}%</span>.
                Aporte al score H:{" "}
                <span className="font-semibold text-sky-400">
                  {((row.level / 4) * row.weight * 100).toFixed(1)} pts
                </span>
                .
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4">
          No se registraron amenazas con nivel superior a 0 para esta tienda.
        </p>
      )}

      {inactive.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Sin amenaza detectada (nivel 0):</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {inactive.map((row) => (
              <span
                key={row.key}
                className="text-xs bg-muted/40 border border-border rounded px-2 py-1 text-muted-foreground"
              >
                {row.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nivel 0 significa que el ensemble CMIP6 y el índice GRI no detectaron condiciones
            de riesgo significativas para esa amenaza en esta ubicación.
          </p>
        </div>
      )}
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
          Los niveles de amenaza provienen de modelos climáticos internacionales. Los días de
          cierre se calibraron con eventos históricos documentados. Los costos de rehabilitación
          siguen estándares del sector construcción peruano.
        </p>
      </div>

      <div className="space-y-2">
        {SOURCES.map((src) => (
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
            y pesimista, no predicciones exactas. Para decisiones de inversión o cumplimiento
            regulatorio, complemente con estudios locales especializados.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * @param {{ asset: object, riskData: object, signals?: Array }} props
 */
export default function TechnicalDetailModal({ asset, riskData }) {
  const [tab, setTab] = useState("score");

  const R = riskData?.formula?.R;
  const total = riskData?.impactBreakdown?.total;

  const hazardCount = riskData
    ? Object.keys(HAZARD_WEIGHTS).filter((k) => (asset[k] ?? 0) > 0).length
    : null;

  const tabs = [
    {
      id: "score",
      label: R != null ? `Score: ${R}/100` : "Score de Riesgo",
      icon: Calculator,
    },
    {
      id: "financial",
      label:
        total != null
          ? `${fmt(total)} pérdida`
          : "Impacto Financiero",
      icon: DollarSign,
    },
    {
      id: "hazards",
      label:
        hazardCount != null
          ? `${hazardCount} amenaza${hazardCount !== 1 ? "s" : ""} activa${hazardCount !== 1 ? "s" : ""}`
          : "Amenazas",
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
            Cálculo paso a paso con los valores reales de esta tienda. Cada número indica qué
            variable se usó, qué valor tenía y cómo contribuyó al resultado final.
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
          {tab === "score"     && <TabRiskScore       asset={asset} riskData={riskData} />}
          {tab === "financial" && <TabFinancialImpact asset={asset} riskData={riskData} />}
          {tab === "hazards"   && <TabHazardLevels    asset={asset} riskData={riskData} />}
          {tab === "sources"   && <TabSources />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
