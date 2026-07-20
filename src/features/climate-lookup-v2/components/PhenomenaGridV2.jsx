import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ChevronDown } from "lucide-react";
import { useState } from "react";
import { riskLevelStyle } from "./riskLevelStyles";

// Auditoría de brecha funcional (D1 §3): orden de presentación de periodos —
// null (sin horizonte, ej. El Niño/La Niña categórico o una anomalía
// observada sin proyección asociada) se muestra primero porque describe el
// presente, no el futuro. Solo aparecen las secciones para las que
// response.phenomena realmente trae al menos 1 fenómeno con ese horizon —
// nunca se renderiza una sección vacía para "completar" la interfaz (regla
// explícita de la auditoría de brecha funcional, punto 3).
const HORIZON_SECTIONS = [
  { key: null,      label: "Estado actual",  hint: "Fenómenos observados o sin banda temporal de proyección" },
  { key: "corto",   label: "Corto plazo",    hint: null },
  { key: "mediano", label: "Mediano plazo",  hint: null },
  { key: "largo",   label: "Largo plazo",    hint: null },
];

function PhenomenonCardV2({ phenomenon }) {
  const style = riskLevelStyle(phenomenon.risk_contribution?.level);
  return (
    <Card className="border-border">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{phenomenon.name}</p>
          <Badge className={style.badge} variant="outline">{style.label}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{phenomenon.status}</span>
          {phenomenon.scenario_label && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{phenomenon.scenario_label}</Badge>
          )}
          {phenomenon.confidence_label && (
            <span className="text-[10px] text-muted-foreground/70">· confianza {phenomenon.confidence_label.toLowerCase()}</span>
          )}
        </div>

        {phenomenon.recommendation?.text ? (
          <p className="text-xs text-foreground/90 leading-relaxed border-t border-border/50 pt-2">
            {phenomenon.recommendation.text}
            {phenomenon.recommendation.is_sector_specific === false && (
              <span className="text-muted-foreground/70"> (medida genérica — sin catálogo específico para este sector)</span>
            )}
          </p>
        ) : phenomenon.recommendation?.reason ? (
          <p className="text-[11px] text-muted-foreground/70 italic border-t border-border/50 pt-2">
            {phenomenon.recommendation.reason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function NotDetectedSection({ items }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-muted-foreground"
      >
        <span>{items.length} fenómeno(s) evaluado(s) sin evidencia suficiente para activarse</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="px-3 pb-3 space-y-1.5">
          {items.map((p, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{p.name}:</span> {p.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * PhenomenaGridV2 — organiza los fenómenos detectados en secciones por
 * horizonte temporal (Estado actual / Corto / Mediano / Largo plazo), cada
 * una con las tarjetas dinámicas correspondientes. Una sección solo se
 * renderiza si `phenomena` trae al menos un fenómeno con ese `horizon` —
 * nunca se fabrican secciones vacías. `phenomenaNotDetected` (Stage 05, ahora
 * proyectado por Stage 07) se muestra aparte, colapsado por defecto, para
 * distinguir explícitamente "no se evaluó" / "se evaluó sin evidencia" de
 * "riesgo bajo confirmado".
 */
export default function PhenomenaGridV2({ phenomena, phenomenaNotDetected }) {
  const list = phenomena || [];

  if (list.length === 0 && (!phenomenaNotDetected || phenomenaNotDetected.length === 0)) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-8 text-center space-y-2">
        <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Sin fenómenos relevantes</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          El pipeline v2 no identificó fenómenos climáticos con riesgo asociado para esta ubicación y sector.
        </p>
      </div>
    );
  }

  const sections = HORIZON_SECTIONS
    .map(section => ({ ...section, items: list.filter(p => (p.horizon || null) === section.key) }))
    .filter(section => section.items.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Fenómenos detectados
      </p>

      {sections.map(section => (
        <div key={section.key ?? "actual"} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <p className="text-xs font-semibold text-foreground">{section.label}</p>
            {section.hint && <p className="text-[10px] text-muted-foreground/70">{section.hint}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {section.items.map((p, i) => (
              <PhenomenonCardV2 key={`${p.name}-${section.key}-${i}`} phenomenon={p} />
            ))}
          </div>
        </div>
      ))}

      <NotDetectedSection items={phenomenaNotDetected} />
    </div>
  );
}
