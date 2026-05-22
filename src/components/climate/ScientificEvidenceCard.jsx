// @ts-nocheck
import { FlaskConical, Link2, ShieldCheck, Database, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const VALIDATION_ICONS = {
  validated:    { Icon: CheckCircle,  color: "text-green-400",  label: "Validado" },
  provisional:  { Icon: AlertCircle,  color: "text-amber-400",  label: "Provisional" },
  experimental: { Icon: AlertCircle,  color: "text-slate-400",  label: "Experimental" },
};

const DEFAULT_REFERENCES = [
  { id: "ipcc_ar6",  source: "IPCC AR6 WG1 (2021)",        note: "Physical science basis — Climate change projections, extreme events, SSP scenarios",            badge: "validated" },
  { id: "cmip6",    source: "CMIP6 CCKP 2023",             note: "Coupled Model Intercomparison Project Phase 6 — 49+ GCMs, ensemble median + p10/p90",          badge: "validated" },
  { id: "gri",      source: "GRI Oxford / WRI Aqueduct 4.0", note: "Infrastructure Resilience probabilistic hazards — flood, drought, heat, landslide at ~1 km",  badge: "validated" },
  { id: "wmo",      source: "WMO State of Climate 2023",   note: "Observational thresholds for extreme heat, precipitation and temperature anomalies",             badge: "validated" },
  { id: "noaa_oni", source: "NOAA CPC / ONI",               note: "Oceanic Niño Index — El Niño / La Niña phase detection via ERSST v5 anomaly",                  badge: "validated" },
  { id: "srtm",     source: "NASA SRTM 30m v3",             note: "Shuttle Radar Topography Mission — slope-based landslide susceptibility (INGEMMET thresholds)", badge: "provisional" },
];

export default function ScientificEvidenceCard({ evidence = null, traceability = null, signals = [] }) {
  const conf = evidence?.confidence || traceability?.confidence || "medium";
  const disclaimer = evidence?.scientific_disclaimer
    || "Descripcion basada en evidencia IPCC AR6, CMIP6, GRI, WMO y NOAA. No representa ranking, urgencia operativa ni perdida financiera estimada.";

  // Build enriched references from active signal traceability when available
  const signalRefs = signals
    .map(s => s.source_traceability)
    .filter(Boolean)
    .filter((t, i, arr) => arr.findIndex(x => x.dataset === t.dataset) === i)
    .slice(0, 4);

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Evidencia cientifica</p>
          <h3 className="text-lg font-semibold mt-1">Fuentes y trazabilidad</h3>
        </div>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="w-3 h-3" />
          Confianza {conf}
        </Badge>
      </div>

      {/* Dynamic traceability from active signals */}
      {signalRefs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Metadatos de senales activas</p>
          {signalRefs.map((trace, i) => (
            <TraceRow key={i} trace={trace} />
          ))}
        </div>
      )}

      {/* Static scientific references */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Referencias clave</p>
        {DEFAULT_REFERENCES.map(ref => (
          <ReferenceRow key={ref.id} ref_={ref} />
        ))}
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg bg-secondary border border-border p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] leading-relaxed text-muted-foreground">{disclaimer}</p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground border-t border-border/50 pt-3">
        <Link2 className="w-3 h-3 flex-shrink-0" />
        Fuente: {traceability?.source || "IPCC AR6, CMIP6, GRI, WRI Aqueduct, NOAA, SRTM"} ·
        Periodo: {traceability?.period || "historico 1980-2014 / proyeccion 2020-2059"} ·
        Escenario SSP: {traceability?.scenario || "SSP2-4.5 / SSP5-8.5"} ·
        Metadata: fuente, dataset, modelo, SSP, ventana temporal, confianza y validation_status
      </p>
    </div>
  );
}

function TraceRow({ trace }) {
  const vs = VALIDATION_ICONS[trace.validation_status] || VALIDATION_ICONS.provisional;
  const { Icon, color, label } = vs;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-2.5">
      <Database className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
      <div className="min-w-0 space-y-0.5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-secondary-foreground truncate">{trace.dataset || trace.source_origin || "Dataset"}</p>
          <span className={`flex items-center gap-0.5 text-[9px] ${color} flex-shrink-0`}>
            <Icon className="w-2.5 h-2.5" />{label}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Modelo: {trace.model || trace.climate_model_badge || "—"} · SSP: {trace.SSP || trace.scenario_ssp || "—"} · Ventana: {trace.temporal_window || trace.temporal_period_label || "—"}
        </p>
        {trace.confidence_text && (
          <p className="text-[10px] text-muted-foreground/70 leading-tight">{trace.confidence_text}</p>
        )}
      </div>
    </div>
  );
}

function ReferenceRow({ ref_ }) {
  const vs = VALIDATION_ICONS[ref_.badge] || VALIDATION_ICONS.validated;
  const { Icon, color, label } = vs;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-2.5">
      <FlaskConical className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
      <div className="min-w-0 space-y-0.5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-secondary-foreground">{ref_.source}</p>
          <span className={`flex items-center gap-0.5 text-[9px] ${color} flex-shrink-0`}>
            <Icon className="w-2.5 h-2.5" />{label}
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">{ref_.note}</p>
      </div>
    </div>
  );
}
