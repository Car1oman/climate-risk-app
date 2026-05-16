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
import { cn } from "@/lib/utils";

// ── Datos de referencia ───────────────────────────────────────────────────────

const SIGNAL_THRESHOLDS = [
  { variable: "Días con temperatura máxima > 35°C",            threshold: "+10 días (corto) / +20 días (mediano)", reference: "IPCC AR6 WG1 Cap. 11"    },
  { variable: "Días con temperatura máxima > 40°C",            threshold: "+5 días",                              reference: "IPCC AR6 WG1 SPM"         },
  { variable: "Noches tropicales (temperatura mínima > 20°C)", threshold: "+10 días (corto) / +20 días (mediano)", reference: "IPCC AR6 WG1 Cap. 11.3"  },
  { variable: "Días consecutivos sin lluvia (sequía)",          threshold: "+15 días sobre histórico",             reference: "IPCC AR6 WG1 Cap. 11.6"  },
  { variable: "Precipitación total vs. histórico",              threshold: "< −15% respecto a baseline 1980–2014", reference: "IPCC AR6 WG2 Cap. 4"     },
  { variable: "Precipitación máxima en 5 días consecutivos",   threshold: "+20% de cambio respecto a histórico",  reference: "IPCC AR6 WG1 Cap. 11.4"  },
  { variable: "Precipitación máxima diaria",                    threshold: "> 50 mm en valor absoluto",            reference: "OMM Estado del Clima 2023" },
  { variable: "Temperatura media",                              threshold: "+1.5°C (corto) / +2.5°C (mediano)",   reference: "Acuerdo de París / IPCC AR6" },
  { variable: "Probabilidad de inundación (GRI)",              threshold: "> 0.35 probabilidad anual",            reference: "WRI Aqueduct Floods"       },
];

const COMPOSITE_COMPONENTS = [
  { key: "probability", label: "Probabilidad de ocurrencia",   weight: "30%", desc: "Probabilidad histórica y proyectada del peligro. Fuente: GRI Oxford. alto=0.80, medio=0.60, bajo=0.40." },
  { key: "intensity",   label: "Intensidad del cambio",        weight: "25%", desc: "Delta normalizado entre el valor proyectado y el histórico. Fuente: índices CMIP6 (días calurosos, lluvia máxima, temperatura media, días secos consecutivos)." },
  { key: "exposure",    label: "Exposición sectorial",         weight: "25%", desc: "Nivel de exposición física del sector. Retail/Salud: 1.0 (alta). Educación/Entretenimiento: 0.5 (media)." },
  { key: "sensitivity", label: "Sensibilidad operacional",     weight: "10%", desc: "Calibrada según impactos históricos documentados por sector en Perú (análisis interno)." },
  { key: "horizon",     label: "Factor temporal de urgencia",  weight: "10%", desc: "Corto plazo 2020–2039: factor 1.0. Mediano plazo 2040–2059: factor 0.75. Largo plazo 2060+: factor 0.50." },
];

const VERIFIABLE_SOURCES = [
  { name: "IPCC AR6 (WG1 + WG2)",  url: "https://www.ipcc.ch/assessment-report/ar6/",           role: "Umbrales de señales y marco metodológico" },
  { name: "CMIP6 / WCRP",           url: "https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6",   role: "Proyecciones climáticas ensemble (1980–2059)" },
  { name: "GRI Oxford",             url: "https://global.infrastructureresilience.org",           role: "Probabilidades de amenaza por infraestructura" },
  { name: "WRI Aqueduct",           url: "https://www.wri.org/aqueduct",                          role: "Riesgo de inundación y sequía hídrica" },
  { name: "Open-Meteo",             url: "https://open-meteo.com/en/docs/climate-api",            role: "Variables climáticas derivadas de CMIP6 (fallback)" },
  { name: "NOAA ENSO",              url: "https://www.cpc.ncep.noaa.gov",                         role: "Fase El Niño / La Niña (Índice ONI)" },
  { name: "TCFD",                   url: "https://www.tcfdhub.org/",                              role: "Marco de impacto financiero sectorial climático" },
  { name: "Banco Mundial",          url: "https://data.worldbank.org",                            role: "Indicadores socioeconómicos de Perú" },
];

const SECTOR_LABELS = {
  retail:          "Retail / Supermercados",
  salud:           "Salud / Clínicas",
  educacion:       "Educación",
  entretenimiento: "Entretenimiento",
  otros:           "Otro sector",
};

const SIGNAL_TYPE_LABELS = {
  extreme_heat:    "Calor extremo (>35°C)",
  severe_heat:     "Calor severo (>40°C)",
  tropical_nights: "Noches tropicales (>20°C)",
  drought:         "Sequía / estrés hídrico",
  extreme_rain:    "Lluvia extrema",
  temp_increase:   "Aumento temperatura media",
  flood_risk:      "Riesgo de inundación",
};

// ── Utilidades de formato ─────────────────────────────────────────────────────

function fmtUSD(v) {
  if (v == null) return "—";
  if (v >= 1_000_000) return `USD ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `USD ${(v / 1_000).toFixed(0)}K`;
  return `USD ${v}`;
}

// ── Sub-componentes compartidos ───────────────────────────────────────────────

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

// ── Pestaña: Score de Riesgo (composite score Layer 4) ────────────────────────

function TabCompositeScore({ analysis }) {
  const metrics   = analysis?.narrative?.key_metrics ?? {};
  const risks     = analysis?.risks ?? [];
  const metadata  = analysis?.metadata ?? {};
  const topRisk   = risks[0];
  const scoreRaw  = metrics.composite_score_top ?? topRisk?.composite_score;
  const score     = scoreRaw != null ? Math.round(scoreRaw * 100) : null;
  const urgency   = metrics.urgencia_top_riesgo ?? topRisk?.urgency ?? "—";
  const sector    = SECTOR_LABELS[metadata.sector] ?? metadata.sector ?? "No especificado";
  const scenario  = metadata.scenario ?? "No especificado";
  const components = topRisk?.score_components ?? {};

  const urgencyColor = {
    "crítica": "text-red-400",
    alta:      "text-orange-400",
    media:     "text-yellow-400",
    baja:      "text-emerald-400",
  }[urgency] ?? "text-foreground";

  const urgencyAction = {
    "crítica": "Acción de adaptación inmediata. Inversión urgente requerida.",
    alta:      "Plan de acción recomendado en 1–3 años.",
    media:     "Monitoreo activo y planificación a 5 años.",
    baja:      "Revisión periódica. Sin acción urgente.",
  }[urgency] ?? "";

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {score != null
            ? <>El score de riesgo <span className={cn("font-bold", urgencyColor)}>{score}/100</span> representa el nivel de riesgo climático compuesto para esta ubicación geográfica bajo el escenario <strong>{scenario}</strong>. Es el valor más alto encontrado entre todos los riesgos priorizados. Urgencia: <span className={cn("font-semibold", urgencyColor)}>{urgency}</span>. {urgencyAction}</>
            : "No hay un score de riesgo disponible para esta ubicación."}
        </p>
        <InfoBox>
          Este score corresponde al riesgo geoespacial de la ubicación, calculado por la
          capa de priorización del sistema (Layer 4). Es distinto del score H×E×I de un
          activo específico: aquí no se usan datos operacionales del negocio, sino únicamente
          información climática y sectorial del punto geográfico seleccionado.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          El score compuesto permite <strong>priorizar</strong> los riesgos detectados en una
          ubicación bajo un marco estandarizado. Un valor de {score ?? "—"}/100 indica que este
          punto geográfico presenta una vulnerabilidad climática {
            urgency === "crítica" ? "extremadamente alta" :
            urgency === "alta"    ? "alta" :
            urgency === "media"   ? "moderada" : "baja"
          } para el sector <strong>{sector}</strong>.
        </p>
        {score != null && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Score</p>
              <p className={cn("text-lg font-bold mt-0.5", urgencyColor)}>{score}/100</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Urgencia</p>
              <p className={cn("text-sm font-bold mt-0.5 capitalize", urgencyColor)}>{urgency}</p>
            </div>
          </div>
        )}
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <ol className="space-y-2">
          <NumberedStep index={1} text="La capa de señales (Layer 2) detectó variables climáticas que superan los umbrales IPCC/OMM para el horizonte analizado." />
          <NumberedStep index={2} text="La capa de riesgo empresarial (Layer 3) mapeó cada señal a impactos operacionales y rangos de impacto financiero según el sector." />
          <NumberedStep index={3} text="La capa de priorización (Layer 4) calculó un score compuesto para cada riesgo usando cinco componentes ponderados." />
          <NumberedStep index={4} text="El score más alto entre todos los riesgos priorizados se muestra como el score de referencia de la ubicación." />
        </ol>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-[11px] text-muted-foreground text-center space-y-1 mt-1">
          <p>Score = (Probabilidad × 0.30) + (Intensidad × 0.25)</p>
          <p>+ (Exposición × 0.25) + (Sensibilidad × 0.10) + (Factor temporal × 0.10)</p>
        </div>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground mb-1">Cinco componentes del score:</p>
          <div className="space-y-1.5">
            {COMPOSITE_COMPONENTS.map((c) => {
              const val = components[c.key];
              return (
                <div key={c.key} className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">{c.label}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {val != null && (
                        <span className="text-[11px] font-mono font-bold text-blue-400">
                          {Math.round(val * 100)}/100
                        </span>
                      )}
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-border text-muted-foreground font-mono">
                        {c.weight}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{c.desc}</p>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 pt-1">
            <DataRow label="Sector analizado"      value={sector} />
            <DataRow label="Escenario climático"   value={scenario} />
            <DataRow label="Fuentes de datos"      value={(metadata.data_sources ?? []).join(", ") || "CMIP6, GRI, Open-Meteo, World Bank"} />
          </div>
        </div>
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "CMIP6 / Base de datos interna", desc: "Proyecciones climáticas por variable e índice para los horizontes 2020–2039 y 2040–2059 respecto al baseline histórico 1980–2014." },
            { src: "GRI Oxford",                     desc: "Probabilidades de amenaza física (inundación, sequía, calor extremo, deslizamiento) a resolución ~1 km." },
            { src: "Open-Meteo API",                 desc: "Fuente de respaldo derivada de CMIP6 cuando la celda más cercana supera el umbral de distancia." },
            { src: "NOAA ENSO",                      desc: "Fase actual de El Niño/La Niña para contextualizar los riesgos de precipitación y temperatura en la región." },
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
          La metodología del score compuesto sigue el marco del <strong>UNDP Disaster Risk Index</strong>
          y el <strong>DARA Climate Vulnerability Monitor</strong>, adaptado al contexto operacional de
          infraestructura retail en Perú. Es coherente con el marco de evaluación de riesgo del IPCC AR6
          WG2, Capítulo 16.
        </p>
        <div className="space-y-1.5 pt-1">
          <DataRow label="Marco base"             value="UNDP DRI + DARA CVMonitor" />
          <DataRow label="Referencia IPCC"        value="AR6 WG2 Cap. 16 — Risk assessment" />
          <DataRow label="Escenario moderado"     value="SSP2-4.5 — +2.1°C a +3.5°C en 2100" />
          <DataRow label="Escenario pesimista"    value="SSP5-8.5 — +3.3°C a +5.7°C en 2100" />
          <DataRow label="Ensemble de modelos"    value="CMIP6 — 49+ centros climáticos (WCRP)" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué modelos o criterios se usaron?">
        <p className="text-xs text-muted-foreground mb-2">Umbrales de urgencia del score compuesto:</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { level: "Crítica",  range: "≥ 75 / 100", color: "text-red-400"     },
            { level: "Alta",     range: "50–74 / 100", color: "text-orange-400"  },
            { level: "Media",    range: "25–49 / 100", color: "text-yellow-400"  },
            { level: "Baja",     range: "< 25 / 100",  color: "text-emerald-400" },
          ].map((item) => (
            <div key={item.level} className="bg-muted/50 rounded-lg p-2.5">
              <p className={cn("text-xs font-bold", item.color)}>{item.level}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{item.range}</p>
            </div>
          ))}
        </div>
        <InfoBox>
          Los pesos de los componentes (Probabilidad 30%, Intensidad 25%, Exposición 25%,
          Sensibilidad 10%, Factor temporal 10%) son parámetros de expertos calibrados con
          base en estudios de riesgo climático para infraestructura en América Latina.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="H" title="¿Quién respalda ese criterio?">
        <ul className="space-y-1.5">
          {[
            { inst: "IPCC AR6 WG2",   role: "Marco metodológico de evaluación y priorización de riesgos" },
            { inst: "UNDP / DARA",    role: "Estructura del score compuesto de riesgo geoespacial" },
            { inst: "WCRP / CMIP6",  role: "Datos climáticos proyectados (ensemble 49+ modelos)" },
            { inst: "TCFD",          role: "Marco de evaluación financiera de riesgos físicos climáticos" },
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
          <strong>El score es una estimación orientativa.</strong> No predice eventos específicos
          ni reemplaza estudios locales de ingeniería o consultoría especializada.
        </WarnBox>
        <ul className="space-y-1.5 mt-1">
          <BulletItem text="Los pesos del score compuesto son definidos por expertos, no calibrados estadísticamente sobre pérdidas históricas reales." />
          <BulletItem text="El modelo es lineal; no captura interacciones no lineales entre riesgos concurrentes (ej. calor extremo + sequía simultáneos)." />
          <BulletItem text="La resolución de CMIP6 (~25 km) puede suavizar variabilidad climática local (microclimas, drenaje urbano, topografía fina)." />
          <BulletItem text="El score no expone intervalos de confianza estadísticos; es el valor central del ensemble." />
          <BulletItem text="No modela riesgos en cascada: interrupción logística, efecto en proveedores, pérdida de reputación." />
        </ul>
      </SectionRow>

      <SectionRow letter="J" title="¿Cómo puedo verificarlo?">
        <div className="space-y-2">
          <VerifyLink name="IPCC AR6 WG2 — Cap. 16 Risk Assessment"      url="https://www.ipcc.ch/report/ar6/wg2/" />
          <VerifyLink name="CMIP6 / WCRP — Modelos climáticos globales"  url="https://www.wcrp-climate.org/wgcm-cmip/wgcm-cmip6" />
          <VerifyLink name="GRI Oxford — Resiliencia de infraestructura" url="https://global.infrastructureresilience.org" />
        </div>
      </SectionRow>

    </div>
  );
}

// ── Pestaña: Impacto Financiero (Layer 3 rangos sectoriales) ─────────────────

function TabFinancialImpact({ analysis }) {
  const metrics  = analysis?.narrative?.key_metrics ?? {};
  const risks    = analysis?.risks ?? [];
  const metadata = analysis?.metadata ?? {};
  const sector   = SECTOR_LABELS[metadata.sector] ?? metadata.sector ?? "No especificado";
  const scenario = metadata.scenario ?? "No especificado";
  const minUSD   = metrics.impacto_financiero_min;
  const maxUSD   = metrics.impacto_financiero_max;

  const riskRanges = risks
    .filter(r => r.financial_impact_range?.min_usd != null)
    .slice(0, 5);

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {minUSD != null
            ? <>El rango <span className="font-bold text-emerald-400">{fmtUSD(minUSD)} – {fmtUSD(maxUSD)}/año</span> representa la estimación del impacto financiero anual potencial para el sector <strong>{sector}</strong> ante los riesgos climáticos detectados en esta ubicación bajo el escenario <strong>{scenario}</strong>.</>
            : "No hay rango de impacto financiero disponible para esta ubicación."
          }
        </p>
        <InfoBox>
          Este rango es <strong>sectorial y orientativo</strong>, no basado en los datos
          financieros de un activo específico. Corresponde a rangos de referencia para el sector
          según el marco TCFD, ajustados al tipo de señal climática detectada. Para obtener una
          estimación financiera del activo específico, utilice el modelo H×E×I desde la vista
          de detalle del activo.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          El impacto financiero cuantifica en términos económicos la exposición potencial del
          sector en esta zona geográfica. Permite priorizar la urgencia de inversiones en adaptación,
          contrastar con primas de seguros de riesgo climático y justificar CAPEX en resiliencia ante
          juntas directivas o comités de riesgo.
        </p>
        {minUSD != null && (
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rango de impacto sectorial estimado</p>
            <p className="text-sm font-bold text-emerald-400">
              {fmtUSD(minUSD)} – {fmtUSD(maxUSD)}
              <span className="text-xs font-normal text-muted-foreground ml-1">/año</span>
            </p>
          </div>
        )}
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <ol className="space-y-2">
          <NumberedStep index={1} text="La capa de señales (Layer 2) identificó los tipos de riesgo climático activos para esta ubicación (calor extremo, sequía, lluvia extrema, etc.)." />
          <NumberedStep index={2} text="La capa de riesgo empresarial (Layer 3) mapeó cada tipo de señal a rangos de impacto financiero en USD por año, según el sector operacional seleccionado." />
          <NumberedStep index={3} text="Los rangos por señal fueron sumados y consolidados para obtener el rango total mínimo y máximo." />
          <NumberedStep index={4} text="Los rangos individuales por riesgo priorizado están disponibles en la sección de desglose." />
        </ol>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <div className="space-y-1.5 mb-3">
          <DataRow label="Sector analizado"    value={sector} />
          <DataRow label="Escenario climático" value={scenario} />
          <DataRow label="Riesgos detectados"  value={`${risks.length} riesgo${risks.length !== 1 ? "s" : ""} priorizado${risks.length !== 1 ? "s" : ""}`} />
        </div>
        {riskRanges.length > 0 && (
          <>
            <p className="text-xs font-semibold text-foreground mb-2">Desglose por riesgo priorizado:</p>
            <div className="space-y-1.5">
              {riskRanges.map((r, i) => {
                const signalLabel = SIGNAL_TYPE_LABELS[r.signal?.signalType] ?? r.signal?.signalType ?? `Riesgo #${i + 1}`;
                return (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground">{signalLabel}</span>
                    <span className="text-xs font-semibold text-emerald-400 flex-shrink-0">
                      {fmtUSD(r.financial_impact_range.min_usd)} – {fmtUSD(r.financial_impact_range.max_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "TCFD — Task Force on Climate-related Financial Disclosures", desc: "Marco metodológico principal. Define rangos de impacto financiero por tipo de riesgo físico agudo para cada sector económico." },
            { src: "Análisis sectorial retail / Perú",                           desc: "Calibración de los rangos TCFD al contexto operacional y de costos del sector retail peruano." },
            { src: "IPCC AR6 WG2",                                               desc: "Estimaciones de pérdidas económicas por eventos climáticos extremos a nivel regional." },
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
          El impacto financiero sigue el enfoque de <strong>riesgo físico agudo</strong> del marco
          TCFD (Task Force on Climate-related Financial Disclosures). Cada señal climática activa
          se mapea a un rango de pérdida en USD/año según la exposición sectorial y el tipo de amenaza.
          La suma de los rangos individuales constituye el rango total de la ubicación.
        </p>
        <div className="space-y-1.5 pt-1">
          <DataRow label="Marco"                  value="TCFD — Riesgo Físico Agudo" />
          <DataRow label="Tipo de estimación"     value="Rango heurístico sectorial (USD/año)" />
          <DataRow label="Naturaleza del valor"   value="Orientativo — no usa datos del activo" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué nivel de incertidumbre existe?">
        <WarnBox>
          Este rango es <strong>heurístico y sectorial</strong>. No refleja los datos financieros
          de ningún activo específico. Úselo como referencia para priorización, no como proyección
          contable.
        </WarnBox>
        <ul className="space-y-1.5 mt-1">
          <BulletItem text="Los rangos por señal son estimaciones de referencia del marco TCFD, no proyecciones actuariales calibradas para esta ubicación." />
          <BulletItem text="No considera características físicas del activo (área, estructura, tenencia), ventas reales, ni número de empleados." />
          <BulletItem text="No modela impactos financieros en cadena: pérdida de reputación, efecto en proveedores, reclamaciones de seguros." />
          <BulletItem text="El rango máximo asume que múltiples riesgos se materializan simultáneamente — escenario de baja probabilidad." />
        </ul>
      </SectionRow>

      <SectionRow letter="H" title="¿Cómo puedo verificarlo?">
        <div className="space-y-2">
          <VerifyLink name="TCFD — Marco de divulgación financiera climática" url="https://www.tcfdhub.org/" />
          <VerifyLink name="IPCC AR6 WG2 — Impactos económicos"              url="https://www.ipcc.ch/report/ar6/wg2/" />
        </div>
      </SectionRow>

    </div>
  );
}

// ── Pestaña: Señales Climáticas ───────────────────────────────────────────────

function TabSignals({ analysis }) {
  const signalsData = analysis?.signals ?? {};
  const list        = signalsData.signals ?? [];
  const count       = signalsData.signals_count ?? list.length;
  const metadata    = analysis?.metadata ?? {};
  const scenario    = metadata.scenario ?? "No especificado";

  return (
    <div className="space-y-2.5">

      <SectionRow letter="A" title="¿Qué significa este valor?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-bold text-foreground">
            {count} señal{count !== 1 ? "es" : ""} climática{count !== 1 ? "s" : ""} detectada{count !== 1 ? "s" : ""}
          </span>{" "}
          para esta ubicación bajo el escenario <strong>{scenario}</strong>. Una señal climática
          es un indicador estadístico que muestra una anomalía proyectada significativa en una
          variable climática, comparada contra el periodo histórico de referencia (1980–2014).
        </p>
        <InfoBox>
          Detectar {count} señal{count !== 1 ? "es" : ""} no implica que {count !== 1 ? "esos" : "ese"}{" "}
          evento{count !== 1 ? "s" : ""} {count !== 1 ? "estén" : "esté"} ocurriendo ya. Indica
          que las proyecciones climáticas del ensemble CMIP6 muestran tendencias que superan
          los umbrales de relevancia definidos por el IPCC y la Organización Meteorológica Mundial.
        </InfoBox>
      </SectionRow>

      <SectionRow letter="B" title="¿Por qué es importante?">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Las señales son el insumo primario de todo el análisis. Cada señal activa genera
          riesgos empresariales (Layer 3), influye en el score compuesto (Layer 4) y origina
          medidas de adaptación recomendadas (Layer 5). A mayor número de señales activas y
          mayor intensidad de sus deltas, más sólido es el fundamento empírico del riesgo detectado.
        </p>
      </SectionRow>

      <SectionRow letter="C" title="¿Cómo se calculó?">
        <ol className="space-y-2">
          <NumberedStep index={1} text="Se consultaron variables climáticas proyectadas desde la base de datos CMIP6 (o Open-Meteo como fallback) para los horizontes corto (2020–2039) y mediano (2040–2059)." />
          <NumberedStep index={2} text="Se compararon contra el baseline histórico (1980–2014): se calcularon anomalías absolutas (ej. +°C) y relativas (ej. % de cambio) para cada variable." />
          <NumberedStep index={3} text="Se aplicaron umbrales de activación definidos por el IPCC AR6 y la Organización Meteorológica Mundial. Cada variable que supera su umbral activa una señal." />
          <NumberedStep index={4} text="Se asignó un nivel de confianza: alta para datos CMIP6 con múltiples modelos concordantes, media para datos GRI u Open-Meteo derivados." />
          <NumberedStep index={5} text="Cuando los datos cuantitativos de CMIP6 no estaban disponibles, se usaron probabilidades del índice GRI como señales cualitativas de respaldo." />
        </ol>
      </SectionRow>

      <SectionRow letter="D" title="¿Qué datos se utilizaron?">
        <p className="text-xs font-semibold text-foreground mb-2">
          Umbrales de activación de señales (IPCC AR6 / OMM):
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

        {list.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-foreground mb-2">Señales activas detectadas:</p>
            <div className="space-y-1.5">
              {list.map((s, i) => {
                const label = SIGNAL_TYPE_LABELS[s.signalType] ?? s.signalType ?? "Señal climática";
                const conf  = s.confidence ?? "low";
                const confColor = conf === "high"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : conf === "medium" ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-400";
                return (
                  <div key={i} className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground">{label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {s.threshold_reference && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          {s.threshold_reference.slice(0, 25)}…
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold ${confColor}`}>{conf}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionRow>

      <SectionRow letter="E" title="¿Qué fuentes participaron?">
        <ul className="space-y-2">
          {[
            { src: "CMIP6 / Base de datos interna", desc: "Variables proyectadas: días con temperatura máxima > 35°C y > 40°C, noches tropicales, precipitación máxima diaria y en 5 días, días secos consecutivos, precipitación total, temperatura media." },
            { src: "GRI Oxford",                     desc: "Probabilidades de amenaza por inundación, sequía, calor extremo y deslizamiento a ~1 km de resolución espacial." },
            { src: "Open-Meteo API",                 desc: "Variables climáticas derivadas de CMIP6 usadas como respaldo cuando la celda más cercana supera el umbral de distancia." },
          ].map((item, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground min-w-fit">{item.src}:</span>
              {item.desc}
            </li>
          ))}
        </ul>
      </SectionRow>

      <SectionRow letter="F" title="¿Qué metodología se aplicó?">
        <div className="space-y-1.5">
          <DataRow label="Escenario moderado"  value="SSP2-4.5 — +2.1°C a +3.5°C en 2100" />
          <DataRow label="Escenario pesimista" value="SSP5-8.5 — +3.3°C a +5.7°C en 2100" />
          <DataRow label="Ensemble de modelos" value="CMIP6 — 49+ centros climáticos (WCRP)" />
          <DataRow label="Periodo histórico"   value="1980–2014 (baseline de calibración)" />
          <DataRow label="Horizontes"          value="Corto: 2020–2039 / Mediano: 2040–2059" />
        </div>
      </SectionRow>

      <SectionRow letter="G" title="¿Qué modelos o criterios se usaron?">
        <div className="space-y-2">
          {[
            { level: "Confianza alta",  badge: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", desc: "Dato del ensemble CMIP6 con múltiples modelos concordantes en la tendencia." },
            { level: "Confianza media", badge: "bg-amber-500/10 border-amber-500/30 text-amber-400",   desc: "Dato de GRI Oxford o Open-Meteo (derivado de modelos CMIP6)." },
            { level: "Confianza baja",  badge: "bg-muted border-border text-muted-foreground",          desc: "Dato inferido por proximidad espacial o calculado indirectamente." },
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
          <BulletItem text="La variabilidad interna del clima puede enmascarar tendencias en horizontes cortos (2020–2039)." />
          <BulletItem text="La resolución ~25 km de CMIP6 puede suavizar efectos locales de topografía y drenaje urbano." />
          <BulletItem text="Las señales GRI tienen menor resolución temporal y dependen de modelos hidrológicos globales." />
          <BulletItem text="El número de señales varía según el escenario climático aplicado (moderado vs. pesimista)." />
        </ul>
      </SectionRow>

      <SectionRow letter="I" title="¿Cómo puedo verificarlo?">
        <div className="space-y-2">
          <VerifyLink name="IPCC AR6 WG1 — Eventos extremos"             url="https://www.ipcc.ch/report/ar6/wg1/" />
          <VerifyLink name="IPCC AR6 WG2 — Impactos y adaptación"        url="https://www.ipcc.ch/report/ar6/wg2/" />
          <VerifyLink name="OMM — Estado del Clima Global 2023"           url="https://wmo.int/publication-series/state-of-global-climate-2023" />
          <VerifyLink name="WRI Aqueduct — Riesgo de inundación"          url="https://www.wri.org/aqueduct" />
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
          Todos los datos presentados pueden rastrearse hasta fuentes públicas, institucionales
          o científicas verificables. Cada fuente se lista con su rol en el análisis y un enlace
          a su documentación oficial.
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
            Los resultados son estimaciones probabilísticas bajo escenarios de emisiones moderado y
            pesimista — no son predicciones exactas. Para decisiones de inversión, ingeniería o
            cumplimiento regulatorio, complemente con estudios locales especializados y datos
            de estaciones meteorológicas locales cuando estén disponibles.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * Botón + modal de trazabilidad metodológica para el análisis geoespacial v2.
 * Diseñado para ClimateRiskLookup (POST /api/v2/climate-risk-analysis).
 *
 * @param {{ analysis: object }} props
 */
export default function ClimateAnalysisTechnicalModal({ analysis }) {
  const [tab, setTab] = useState("score");

  const tabs = [
    { id: "score",     label: "Score de Riesgo",    icon: Calculator },
    { id: "financial", label: "Impacto Financiero", icon: DollarSign  },
    { id: "signals",   label: "Señales",            icon: Activity    },
    { id: "sources",   label: "Fuentes",            icon: Database    },
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
            Origen, proceso de cálculo, criterios y fuentes verificables de cada dato presentado.
            Cada sección responde: ¿qué significa?, ¿cómo se calculó?, ¿quién lo respalda?,
            ¿qué incertidumbre existe?
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
          {tab === "score"     && <TabCompositeScore  analysis={analysis} />}
          {tab === "financial" && <TabFinancialImpact analysis={analysis} />}
          {tab === "signals"   && <TabSignals         analysis={analysis} />}
          {tab === "sources"   && <TabSources />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
