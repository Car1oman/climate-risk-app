// @ts-nocheck
import { useState } from "react";
import {
  FlaskConical,
  Info,
  Database,
  Calculator,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Activity,
  Shield,
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
import { HAZARD_LABELS, HAZARD_WEIGHTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Datos de referencia metodológica ─────────────────────────────────────────

const REHAB_PER_M2 = {
  hazard_flood:     { cost: 120 },
  hazard_elnino:    { cost: 150 },
  hazard_earthquake:{ cost: 350 },
  hazard_landslide: { cost: 200 },
  hazard_drought:   { cost: 40  },
};

const SIGNAL_THRESHOLDS = [
  { variable: "Días con temperatura máxima > 35°C",             threshold: "+10 días (corto) / +20 días (mediano)", reference: "IPCC AR6 WG1 Cap. 11" },
  { variable: "Días con temperatura máxima > 40°C",             threshold: "+5 días",                             reference: "IPCC AR6 WG1 SPM" },
  { variable: "Noches tropicales (temperatura mínima > 20°C)",  threshold: "+10 días (corto) / +20 días (mediano)", reference: "IPCC AR6 WG1 Cap. 11.3" },
  { variable: "Días consecutivos sin lluvia (sequía)",           threshold: "+15 días sobre histórico",            reference: "IPCC AR6 WG1 Cap. 11.6" },
  { variable: "Precipitación total vs. histórico",               threshold: "< −15% respecto a baseline 1980–2014", reference: "IPCC AR6 WG2 Cap. 4" },
  { variable: "Precipitación máxima en 5 días consecutivos",    threshold: "+20% de cambio respecto a histórico", reference: "IPCC AR6 WG1 Cap. 11.4" },
  { variable: "Precipitación máxima diaria",                     threshold: "> 50 mm en valor absoluto",           reference: "OMM Estado del Clima 2023" },
  { variable: "Temperatura media",                               threshold: "+1.5°C (corto) / +2.5°C (mediano)",  reference: "Acuerdo de París / IPCC AR6" },
  { variable: "Probabilidad de inundación (GRI)",               threshold: "> 0.35 probabilidad anual",           reference: "WRI Aqueduct Floods" },
];

const VERIFIABLE_SOURCES = [
  { name: "IPCC AR6 (WG1 + WG2)",            url: "https://www.ipcc.ch/assessment-report/ar6/",           role: "Umbrales de señales y marco metodológico" },
  { name: "CMIP6 / WCRP",                     url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",   role: "Proyecciones climáticas (1980–2059)" },
  { name: "GRI Oxford",                        url: "https://global.infrastructureresilience.org",          role: "Probabilidades de amenaza por infraestructura" },
  { name: "WRI Aqueduct",                      url: "https://www.wri.org/aqueduct",                         role: "Riesgo de inundación y sequía hídrica" },
  { name: "Open-Meteo",                        url: "https://open-meteo.com/en/docs/climate-api",           role: "Variables climáticas derivadas de CMIP6" },
  { name: "NOAA ENSO",                         url: "https://www.cpc.ncep.noaa.gov",                        role: "Fase El Niño / La Niña (Índice ONI)" },
  { name: "TCFD",                              url: "https://www.tcfdhub.org/",                             role: "Marco de divulgación financiera climática" },
  { name: "Banco Mundial",                     url: "https://data.worldbank.org",                           role: "Indicadores socioeconómicos de Perú" },
];

// ── Utilidades de formato ─────────────────────────────────────────────────────

const fmt = (v) =>
  `S/ ${Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

// ── Sub-componentes ───────────────────────────────────────────────────────────

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

function SectionRow({ letter, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-blue-500/15 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {letter}
          </span>
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex gap-2">
      <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function WarnBox({ children }) {
  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function DataRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

function VerifyLink({ name, url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors"
    >
      <span className="text-xs font-medium text-foreground">{name}</span>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
    </a>
  );
}

function NumberedStep({ index, text }) {
  return (
    <li className="flex gap-2 text-xs text-muted-foreground">
      <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {index}
      </span>
      {text}
    </li>
  );
}

function BulletItem({ text }) {
  return (
    <li className="flex gap-2 text-xs text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
      {text}
    </li>
  );
}

// ── Pestaña: Score de Riesgo ──────────────────────────────────────────────────

function TabRiskScore({ asset, riskData }) {
  if (!riskData) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Sin datos de riesgo disponibles.</p>;
  }

  const { riskScore, riskLevel, hazardScore, exposureScore, impactScore, topRiskKey } = riskData;
  const R = Math.round(riskScore * 100);
  const H = Math.round(hazardScore * 100);
  const E = Math.round(exposureScore * 100);
  const I = Math.round(impactScore * 100);
  const topHazardLabel = HAZARD_LABELS[topRiskKey] || topRiskKey;

  const levelLabel  = { critico: "Crítico", alto: "Alto", medio: "Medio", bajo: "Bajo" }[riskLevel] || riskLevel;
  const levelColor  = { critico: "text-red-400", alto: "text-orange-400", medio: "text-yellow-400", bajo: "text-emerald-400" }[riskLevel] || "text-foreground";
  const levelAction = {
    critico: "extremadamente alta ante eventos climáticos combinados. Se requieren medidas de adaptación inmediatas.",
    alto:    "alta ante amenazas climáticas. Se recomienda implementar medidas urgentes en el corto plazo.",
    medio:   "moderada. Se recomienda monitoreo activo y planificación de medidas preventivas.",
    bajo:    "baja. Se mantienen precauciones básicas y revisión periódica.",
  }[riskLevel] || "";

  const hazardRows = Object.entries(HAZARD_WEIGHTS).map(([key, weight]) => ({
    label:       HAZARD_LABELS[key],
    weight:      `${(weight * 100).toFixed(0)}%`,
    level:       asset[key] || 0,
    normalizado: `${(((asset[key] || 0) / 4) * 100).toFixed(0)}%`,
  }));

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          El score de riesgo{" "}
          <span className={cn("font-bold", levelColor)}>{R}/100</span> representa
          la vulnerabilidad climática operativa estimada de este activo en una escala
          normalizada de 0 a 100. Un valor de <strong>{R}</strong> indica nivel{" "}
          <strong>{levelLabel}</strong>: el activo presenta una exposición {levelAction}
        </p>
        <InfoBox>
          El score <strong>no es una predicción</strong> de eventos futuros; es una
          estimación probabilística de exposición climática basada en proyecciones del
          ensemble CMIP6 y datos de resiliencia de infraestructura. Debe leerse como
          un indicador relativo de riesgo, no como una certeza.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Un score estandarizado permite comparar activos de distintas ubicaciones,
          tipos y tamaños bajo el mismo marco metodológico. Para este activo, la amenaza
          que más condiciona el resultado es <strong>{topHazardLabel}</strong>, y los
          tres componentes aportan:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Amenazas (H)", value: `${H}%`, color: "text-sky-400" },
            { label: "Exposición (E)", value: `${E}%`, color: "text-amber-400" },
            { label: "Impacto (I)", value: `${I}%`, color: "text-emerald-400" },
          ].map((item) => (
            <div key={item.label} className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
              <p className={cn("text-sm font-bold mt-0.5", item.color)}>{item.value}</p>
            </div>
          ))}
        </div>
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <ol className="space-y-2">
          <NumberedStep index={1} text="Se recopilaron los niveles de cada amenaza climática registrados para el activo (escala 0–4 por amenaza)." />
          <NumberedStep index={2} text="Se normalizaron dividiéndolos entre 4, llevándolos a una escala 0–1 por amenaza." />
          <NumberedStep index={3} text="Se aplicaron pesos de importancia relativa a cada amenaza para obtener el puntaje de amenazas (H)." />
          <NumberedStep index={4} text="Se calculó la exposición (E) normalizando el área del activo según su tipo de negocio." />
          <NumberedStep index={5} text="Se estimó el impacto financiero total y se normalizó contra una línea base de S/20 millones." />
          <NumberedStep index={6} text={`Se aplicó la fórmula: R = (H × 40%) + (E × 30%) + (I × 30%) = (${hazardScore.toFixed(2)} × 0.40) + (${exposureScore.toFixed(2)} × 0.30) + (${impactScore.toFixed(2)} × 0.30) = ${riskScore.toFixed(3)} → ${R}/100`} />
        </ol>
        <div className="bg-muted/50 rounded-lg p-3 text-center font-mono text-xs space-y-1">
          <p className="text-muted-foreground">R = (H × 0.40) + (E × 0.30) + (I × 0.30)</p>
          <p>
            <span className={cn("font-bold text-lg", levelColor)}>{R}/100</span>
            <span className="text-muted-foreground text-[11px] ml-2">→ Nivel {levelLabel}</span>
          </p>
        </div>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <p className="text-xs font-semibold text-foreground mb-2">Pesos y niveles por amenaza:</p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Amenaza</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Peso</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Nivel (0–4)</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Normalizado</th>
              </tr>
            </thead>
            <tbody>
              {hazardRows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{row.weight}</td>
                  <td className="px-3 py-2 text-center font-mono font-semibold">{row.level}/4</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{row.normalizado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5 pt-1">
          <DataRow label="Área del activo"          value={`${(asset.area_m2 || 1000).toLocaleString("es-PE")} m²`} />
          <DataRow label="Tipo de activo"            value={asset.type || "No especificado"} />
          <DataRow label="Ventas mensuales"          value={fmt(asset.monthly_sales || 500000)} />
        </div>
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "CMIP6 / WCRP",   desc: "Proyecciones históricas (1980–2014) y futuras (2020–2059) para los niveles de amenaza. Ensemble de 49+ centros climáticos internacionales." },
            { src: "GRI Oxford",     desc: "Probabilidades de amenaza para infraestructura a resolución ~1 km. Cubre inundación, calor extremo, sequía, deslizamiento." },
            { src: "Open-Meteo API", desc: "Variables climáticas derivadas de CMIP6 como fuente de respaldo cuando la celda CMIP6 más cercana supera el umbral de distancia." },
            { src: "NOAA ENSO",      desc: "Fase actual de El Niño / La Niña mediante el Índice Oceánico Niño (ONI) para calibrar el multiplicador de amenaza del fenómeno." },
          ].map((item, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground min-w-fit">{item.src}:</span>
              {item.desc}
            </li>
          ))}
        </ul>
      </SectionRow>

      <SectionRow letter="F" title="¿Qué metodología se aplicó?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          La metodología sigue el marco de evaluación de riesgo del <strong>IPCC AR5/AR6</strong>:
          Riesgo = f(Peligro, Exposición, Vulnerabilidad). La fórmula H×E×I es una implementación
          operacional de ese marco, adaptada para activos de infraestructura retail en Perú, y
          complementada con el índice compuesto geoespacial del UNDP para la priorización.
        </p>
        <div className="space-y-1.5">
          <DataRow label="Marco de referencia"  value="IPCC AR5/AR6 — Risk Assessment Framework" />
          <DataRow label="Escenario climático"  value="Moderado (SSP2-4.5) / Pesimista (SSP5-8.5)" />
          <DataRow label="Horizonte corto"      value="2020–2039" />
          <DataRow label="Horizonte mediano"    value="2040–2059" />
          <DataRow label="Modelos ensemble"     value="CMIP6 — 49+ centros (WCRP)" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué modelos o criterios se usaron?">
        <p className="text-xs text-muted-foreground mb-2">
          Los umbrales de clasificación del score y los pesos de amenazas son:
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { level: "Crítico",  range: "≥ 75 / 100",   color: "text-red-400"     },
            { level: "Alto",     range: "50–74 / 100",   color: "text-orange-400"  },
            { level: "Medio",    range: "25–49 / 100",   color: "text-yellow-400"  },
            { level: "Bajo",     range: "< 25 / 100",    color: "text-emerald-400" },
          ].map((item) => (
            <div key={item.level} className="bg-muted/50 rounded-lg p-2.5">
              <p className={cn("text-xs font-bold", item.color)}>{item.level}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{item.range}</p>
            </div>
          ))}
        </div>
        <InfoBox>
          Los pesos de amenazas (Inundación Fluvial 30%, Fenómeno El Niño 25%, Sismo 20%,
          Deslizamiento 15%, Sequía Hídrica 10%) fueron definidos por expertos considerando
          la frecuencia histórica e impacto documentado de estos eventos en el territorio peruano.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="H" title="¿Quién respalda ese criterio?">
        <ul className="space-y-1.5">
          {[
            { inst: "IPCC AR6",       role: "Marco metodológico de evaluación de riesgo climático" },
            { inst: "WCRP / CMIP6",   role: "Datos climáticos proyectados y ensemble de modelos" },
            { inst: "UNDP DRI",       role: "Referencia para score compuesto de riesgo geoespacial" },
            { inst: "TCFD",           role: "Marco de divulgación financiera ante riesgos climáticos" },
          ].map((item) => (
            <li key={item.inst} className="flex gap-2 text-xs">
              <span className="font-semibold text-foreground min-w-fit">{item.inst}:</span>
              <span className="text-muted-foreground">{item.role}</span>
            </li>
          ))}
        </ul>
      </SectionRow>

      <SectionRow letter="I" title="¿Qué nivel de incertidumbre existe?">
        <WarnBox>
          <strong>El score es una estimación, no una certeza.</strong> Existe incertidumbre
          inherente a todo modelo climático proyectado.
        </WarnBox>
        <ul className="space-y-1.5 mt-1">
          <BulletItem text="Los pesos de la fórmula son definidos por expertos, no calibrados estadísticamente sobre datos históricos de pérdidas reales." />
          <BulletItem text="La resolución espacial de CMIP6 (~25 km) puede no capturar microclimas urbanos locales." />
          <BulletItem text="El modelo no simula interacciones no lineales entre amenazas simultáneas (ej. calor + sequía)." />
          <BulletItem text="Las proyecciones a mediano plazo (2040–2059) tienen mayor incertidumbre que el horizonte corto." />
          <BulletItem text="El score es el valor central del ensemble; no expone intervalos de confianza estadísticos." />
        </ul>
      </SectionRow>

      <SectionRow letter="J" title="¿Cómo puedo verificarlo?">
        <p className="text-xs text-muted-foreground mb-2">Las fuentes que respaldan esta metodología son verificables públicamente:</p>
        <div className="space-y-2">
          <VerifyLink name="IPCC AR6 — Evaluación de riesgo climático" url="https://www.ipcc.ch/assessment-report/ar6/" />
          <VerifyLink name="CMIP6 / WCRP — Modelos climáticos"         url="https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6" />
          <VerifyLink name="GRI Oxford — Resiliencia de infraestructura" url="https://global.infrastructureresilience.org" />
        </div>
      </SectionRow>

    </div>
  );
}

// ── Pestaña: Impacto Financiero ───────────────────────────────────────────────

function TabFinancialImpact({ asset, riskData }) {
  if (!riskData?.impactBreakdown) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Sin datos financieros disponibles.</p>;
  }

  const { impactBreakdown, topRiskKey } = riskData;
  const { total, lostSales, staffCost, logisticsCost, rehabCost, closureDays } = impactBreakdown;
  const topHazardLabel = HAZARD_LABELS[topRiskKey] || topRiskKey;
  const rehabCostPerM2 = (REHAB_PER_M2[topRiskKey] || { cost: 120 }).cost;
  const isRented  = asset.condition === "alquilado";
  const area      = asset.area_m2      || 1000;
  const employees = asset.num_employees || 50;
  const sales     = asset.monthly_sales || 500000;

  const components = [
    {
      label:   "1. Ventas perdidas",
      formula: `S/${(sales / 1000).toFixed(0)}K × (${closureDays} días / 30)`,
      value:   fmt(lostSales),
      desc:    "Ingresos no generados durante el período de cierre operativo.",
    },
    {
      label:   "2. Costos de personal",
      formula: `${employees} empleados × S/80/día × ${closureDays} días`,
      value:   fmt(staffCost),
      desc:    "Obligaciones laborales durante el cierre (salarios fijos no recuperables).",
    },
    {
      label:   "3. Costos logísticos",
      formula: `Ventas perdidas × 15%`,
      value:   fmt(logisticsCost),
      desc:    "Ruptura de cadena de suministro, reubicación de inventario y transporte adicional.",
    },
    {
      label:   "4. Rehabilitación física",
      formula: `${area.toLocaleString("es-PE")} m² × S/${rehabCostPerM2}/m² × ${isRented ? "0.4 (arrendado)" : "1.0 (propio)"}`,
      value:   fmt(rehabCost),
      desc:    `Reparación del local afectado por ${topHazardLabel.toLowerCase()}. ${isRented ? "Reducido 60% por condición de arrendamiento." : "Aplicado al 100% por ser propiedad propia."}`,
    },
  ];

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          El impacto financiero estimado de{" "}
          <span className="font-bold text-emerald-400">{fmt(total)}</span> representa el
          costo total potencial ante un evento climático grave asociado a la amenaza
          principal: <strong>{topHazardLabel}</strong>. Es la suma de cuatro componentes
          de pérdida directa e indirecta, calculados bajo el supuesto de que esa amenaza
          se materializa en el nivel de riesgo actual del activo.
        </p>
        <InfoBox>
          Esta estimación es <strong>determinista</strong> para el nivel de amenaza actual.
          No es un valor esperado probabilístico, sino el costo proyectado en el escenario
          en que ocurre el evento climático identificado.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          El impacto financiero cuantifica en términos económicos la exposición operativa
          del activo, permitiendo priorizar inversiones en adaptación y tomar decisiones
          informadas sobre coberturas de seguros, planes de continuidad del negocio y
          CAPEX en resiliencia.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/50 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total estimado</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{fmt(total)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Días de cierre</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{closureDays} días</p>
          </div>
        </div>
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <p className="text-xs text-muted-foreground mb-2">El cálculo suma cuatro componentes:</p>
        <div className="space-y-2">
          {components.map((item) => (
            <div key={item.label} className="bg-muted/30 rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{item.label}</span>
                <span className="text-xs font-bold text-emerald-400 flex-shrink-0">{item.value}</span>
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">{item.formula}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mt-1">
          <span className="text-xs font-semibold text-foreground">Total estimado</span>
          <span className="text-sm font-bold text-emerald-400">{fmt(total)}</span>
        </div>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <div className="space-y-1.5">
          <DataRow label="Ventas mensuales del activo"              value={fmt(sales)} />
          <DataRow label="Número de empleados"                      value={`${employees} personas`} />
          <DataRow label="Área del local"                           value={`${area.toLocaleString("es-PE")} m²`} />
          <DataRow label="Amenaza principal"                        value={topHazardLabel} />
          <DataRow label="Nivel de amenaza"                         value={`${asset[topRiskKey] || 0}/4`} />
          <DataRow label="Días de cierre (nivel → días)"            value={`Nivel ${asset[topRiskKey] || 0} → ${closureDays} días`} />
          <DataRow label="Costo de rehabilitación por m²"          value={`S/ ${rehabCostPerM2}/m²`} />
          <DataRow label="Condición del local"                      value={isRented ? "Arrendado (factor 0.4)" : "Propio (factor 1.0)"} />
        </div>
        <InfoBox>
          Los días de cierre estimados por nivel de amenaza siguen la escala: Nivel 0 → 0 días,
          Nivel 1 → 3 días, Nivel 2 → 7 días, Nivel 3 → 21 días, Nivel 4 → 45 días. Esta calibración
          se basa en eventos históricos documentados de amenazas similares en la región.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "Datos operacionales del activo",                            desc: "Ventas, empleados y área extraídas del registro del activo en la plataforma." },
            { src: "TCFD — Task Force on Climate-related Financial Disclosures", desc: "Marco metodológico para estimación de impacto financiero por riesgos climáticos en sector retail." },
            { src: "Referencias de construcción (Perú)",                         desc: "Costos de rehabilitación física por amenaza estimados según estándares del sector construcción peruano." },
            { src: "Eventos históricos similares",                               desc: "Días de cierre calibrados en función de eventos climáticos documentados de amenaza similar en la región." },
          ].map((item, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground min-w-fit">{item.src}:</span>
              {item.desc}
            </li>
          ))}
        </ul>
      </SectionRow>

      <SectionRow letter="F" title="¿Qué metodología se aplicó?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          La estimación sigue el marco de divulgación de riesgos climáticos <strong>TCFD</strong>
          (Task Force on Climate-related Financial Disclosures), que clasifica los impactos en
          riesgos físicos agudos (eventos extremos) y crónicos. Este cálculo corresponde al
          riesgo físico agudo: el costo de un único evento climático severo.
        </p>
        <div className="space-y-1.5 pt-1">
          <DataRow label="Marco"                  value="TCFD — Riesgo Físico Agudo" />
          <DataRow label="Tipo de estimación"     value="Determinista por nivel de amenaza" />
          <DataRow label="Línea base financiera"  value="S/ 20 millones (normalización del componente I)" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué nivel de incertidumbre existe?">
        <WarnBox>
          El valor estimado <strong>no es una predicción de pérdidas reales</strong>. Es una
          aproximación conservadora basada en supuestos simplificados.
        </WarnBox>
        <ul className="space-y-1.5 mt-1">
          <BulletItem text="Los días de cierre son valores medios por nivel de amenaza; eventos reales pueden durar más o menos según condiciones locales." />
          <BulletItem text="El costo de rehabilitación por m² es una estimación genérica sin inspección física real del activo." />
          <BulletItem text="No se modelan impactos en cadena: pérdidas de reputación, efecto en clientes o en proveedores." />
          <BulletItem text="No considera inflación ni variaciones estacionales en precios de construcción." />
          <BulletItem text="Las ventas mensuales se asumen constantes; no modela estacionalidad del negocio." />
        </ul>
      </SectionRow>

      <SectionRow letter="H" title="¿Cómo puedo verificarlo?">
        <p className="text-xs text-muted-foreground mb-2">El marco metodológico puede verificarse en:</p>
        <div className="space-y-2">
          <VerifyLink name="TCFD — Marco de divulgación financiera climática"   url="https://www.tcfdhub.org/" />
          <VerifyLink name="IPCC AR6 WG2 — Impactos económicos del cambio climático" url="https://www.ipcc.ch/report/ar6/wg2/" />
        </div>
      </SectionRow>

    </div>
  );
}

// ── Pestaña: Señales Climáticas ───────────────────────────────────────────────

function TabSignals({ signals }) {
  const count = Array.isArray(signals) ? signals.length : 0;

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-bold text-foreground">
            {count} señal{count !== 1 ? "es" : ""} climática{count !== 1 ? "s" : ""} detectada{count !== 1 ? "s" : ""}
          </span>{" "}
          para esta ubicación. Una señal climática es un indicador estadístico que muestra una
          anomalía significativa en una variable climática proyectada, comparada contra el periodo
          histórico de referencia (1980–2014). Las señales indican que se espera un cambio relevante
          en las condiciones climáticas de esta zona durante el horizonte de análisis.
        </p>
        <InfoBox>
          Detectar {count} señal{count !== 1 ? "es" : ""} no significa que {count !== 1 ? "esos eventos" : "ese evento"}{" "}
          {count !== 1 ? "ya están ocurriendo" : "ya está ocurriendo"}. Significa que las proyecciones
          climáticas muestran tendencias que superan umbrales de relevancia definidos por el IPCC y la
          Organización Meteorológica Mundial.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Las señales climáticas son el insumo primario del análisis de riesgo. Cada señal activa
          corresponde a un cambio proyectado que podría afectar la operación, infraestructura o cadena
          de suministro del activo. A mayor número de señales activas y mayor intensidad, mayor es el
          fundamento empírico detrás del score de riesgo resultante.
        </p>
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <ol className="space-y-2">
          <NumberedStep index={1} text="Se obtuvieron series de variables climáticas proyectadas desde CMIP6 (vía base de datos interna o Open-Meteo) para los horizontes corto (2020–2039) y mediano (2040–2059)." />
          <NumberedStep index={2} text="Se compararon contra el baseline histórico (1980–2014): se calcularon anomalías absolutas (ej. +°C) y relativas (ej. % de cambio) por variable." />
          <NumberedStep index={3} text="Se aplicaron umbrales de activación definidos según estándares del IPCC AR6 y la Organización Meteorológica Mundial (OMM)." />
          <NumberedStep index={4} text="Cada variable que supera su umbral genera una señal activa con nivel de confianza según la fuente del dato (CMIP6 = alta, GRI = media)." />
          <NumberedStep index={5} text="Si los datos cuantitativos de CMIP6 no están disponibles, se usan probabilidades del índice GRI como señal cualitativa de respaldo." />
        </ol>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <p className="text-xs font-semibold text-foreground mb-2">
          Umbrales que activan una señal (basados en IPCC AR6 y OMM):
        </p>
        <div className="space-y-1.5">
          {SIGNAL_THRESHOLDS.map((t, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-foreground">{t.variable}</p>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Umbral: <span className="font-mono font-semibold">{t.threshold}</span>
                </p>
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">
                  {t.reference}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "CMIP6 / Base de datos interna", desc: "Variables proyectadas: días con temperatura máxima > 35°C y > 40°C, noches tropicales, precipitación máxima diaria y en 5 días, días secos consecutivos, precipitación total, temperatura media." },
            { src: "GRI Oxford",                     desc: "Probabilidades de amenaza por inundación, sequía, calor extremo y deslizamiento a ~1 km de resolución espacial." },
            { src: "Open-Meteo API",                 desc: "Fuente de respaldo derivada de CMIP6 cuando la celda más cercana supera el umbral de distancia aceptable." },
          ].map((item, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground min-w-fit">{item.src}:</span>
              {item.desc}
            </li>
          ))}
        </ul>
      </SectionRow>

      <SectionRow letter="F" title="¿Qué metodología se aplicó?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Los umbrales de señal siguen los estándares del <strong>IPCC AR6</strong> (Grupos de
          Trabajo I y II) y la <strong>Organización Meteorológica Mundial (OMM)</strong>. El
          Acuerdo de París define el umbral de temperatura global de +1.5°C como nivel de
          referencia. Los umbrales de precipitación extrema se basan en el Capítulo 11.4 del
          IPCC AR6 WG1.
        </p>
        <div className="space-y-1.5 pt-1">
          <DataRow label="Escenario moderado"   value="SSP2-4.5 — +2.1°C a +3.5°C en 2100" />
          <DataRow label="Escenario pesimista"  value="SSP5-8.5 — +3.3°C a +5.7°C en 2100" />
          <DataRow label="Ensemble de modelos"  value="CMIP6 — 49+ centros climáticos (WCRP)" />
          <DataRow label="Periodo histórico"    value="1980–2014 (baseline de calibración)" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué modelos o criterios se usaron?">
        <p className="text-xs text-muted-foreground mb-2">Niveles de confianza de las señales:</p>
        <div className="space-y-2">
          {[
            {
              level: "Confianza alta",
              badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
              desc:  "Dato proveniente del ensemble CMIP6 con múltiples modelos concordantes en la tendencia.",
            },
            {
              level: "Confianza media",
              badge: "bg-amber-500/10 border-amber-500/30 text-amber-400",
              desc:  "Dato proveniente de GRI Oxford o Open-Meteo (derivado de modelos CMIP6).",
            },
            {
              level: "Confianza baja",
              badge: "bg-muted border-border text-muted-foreground",
              desc:  "Dato inferido por proximidad espacial o calculado indirectamente.",
            },
          ].map((item) => (
            <div key={item.level} className={cn("rounded-lg border px-3 py-2", item.badge.split(" ").slice(0, 2).join(" "))}>
              <p className={cn("text-xs font-semibold", item.badge.split(" ").slice(2).join(" "))}>{item.level}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </SectionRow>

      <SectionRow letter="H" title="¿Qué nivel de incertidumbre existe?">
        <WarnBox>
          Las señales son indicativas de tendencias climáticas, no predictivas de eventos
          específicos con fecha y magnitud exactas.
        </WarnBox>
        <ul className="space-y-1.5 mt-1">
          <BulletItem text="La variabilidad interna del clima puede enmascarar tendencias en el horizonte corto (2020–2039)." />
          <BulletItem text="La resolución ~25 km de CMIP6 puede suavizar efectos locales de topografía y drenaje urbano." />
          <BulletItem text="Las señales basadas en GRI tienen menor resolución temporal y dependen de modelos hidrológicos globales." />
          <BulletItem text="El número de señales puede variar según el escenario climático seleccionado (moderado vs. pesimista)." />
        </ul>
      </SectionRow>

      <SectionRow letter="I" title="¿Cómo puedo verificarlo?">
        <div className="space-y-2">
          <VerifyLink name="IPCC AR6 WG1 — Eventos extremos"              url="https://www.ipcc.ch/report/ar6/wg1/" />
          <VerifyLink name="IPCC AR6 WG2 — Impactos y adaptación"         url="https://www.ipcc.ch/report/ar6/wg2/" />
          <VerifyLink name="OMM — Estado del Clima Global 2023"            url="https://wmo.int/publication-series/state-of-global-climate-2023" />
          <VerifyLink name="WRI Aqueduct — Riesgo de inundación y sequía" url="https://www.wri.org/aqueduct" />
        </div>
      </SectionRow>

    </div>
  );
}

// ── Pestaña: Fuentes y Verificación ──────────────────────────────────────────

function TabSources() {
  return (
    <div className="space-y-3">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          Trazabilidad y verificación
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Todos los datos presentados en esta plataforma pueden rastrearse hasta una fuente
          pública, institucional o científica verificable. Cada fuente se lista con su
          institución responsable, su rol en el análisis y un enlace a su documentación oficial.
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
            <p className="text-[10px] text-muted-foreground/50 font-mono break-all">{src.url}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Interpretación técnica</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed mt-0.5">
            Los resultados son estimaciones probabilísticas bajo escenarios de emisión moderado y
            pesimista, no predicciones exactas. Para decisiones de inversión, ingeniería o
            cumplimiento regulatorio se recomienda complementar con estudios locales especializados.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * Botón + modal de trazabilidad metodológica para cada dato visible en pantalla.
 *
 * @param {{ asset: object, riskData: object, signals?: Array }} props
 */
export default function TechnicalDetailModal({ asset, riskData, signals }) {
  const [tab, setTab] = useState("score");

  const tabs = [
    { id: "score",     label: "Score de Riesgo",      icon: Calculator },
    { id: "financial", label: "Impacto Financiero",   icon: DollarSign  },
    { id: "signals",   label: "Señales Climáticas",   icon: Activity    },
    { id: "sources",   label: "Fuentes",              icon: Database    },
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
            Detalle técnico y trazabilidad metodológica
          </DialogTitle>
          <DialogDescription>
            Origen, proceso de cálculo, criterios y fuentes verificables de cada dato presentado
            en pantalla. Cada sección responde las preguntas: ¿qué significa?, ¿cómo se calculó?,
            ¿quién respalda ese criterio?, ¿qué incertidumbre existe?
          </DialogDescription>
        </DialogHeader>

        {/* Navegación de pestañas */}
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

        {/* Contenido de la pestaña activa */}
        <div className="mt-1">
          {tab === "score"     && <TabRiskScore       asset={asset}    riskData={riskData} />}
          {tab === "financial" && <TabFinancialImpact asset={asset}    riskData={riskData} />}
          {tab === "signals"   && <TabSignals         signals={signals} />}
          {tab === "sources"   && <TabSources />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
