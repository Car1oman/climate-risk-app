// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import {
  DATA_SOURCES,
  SSP_SCENARIOS,
  TEMPORAL_HORIZONS,
  ANALYSIS_LIMITATIONS,
  RESPONSIBLE_INSTITUTIONS,
  resolveSourceKey,
} from "@/lib/methodologyConfig";
import ScientificReferencesModal from "@/components/climate/ScientificReferencesModal";

export default function MethodologyPanel({ metadata }) {
  const [open, setOpen] = useState(false);
  const rawSources = metadata?.data_sources ?? [];
  const activeKeys = rawSources.length > 0 ? rawSources.map(resolveSourceKey).filter(Boolean) : [];
  const scenarioKey = metadata?.scenario === "pesimista" ? "ssp585" : metadata?.scenario === "optimista" ? "ssp245" : null;
  const badgeIds = activeKeys.length > 0
    ? [...new Set([...activeKeys, ...(scenarioKey ? [scenarioKey] : ["ssp245", "ssp585"])])]
    : ["climate_cells", "gri", "open_meteo", "world_bank", "enso", "terrain", "ssp245", "ssp585"];

  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="pb-0 pt-4">
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start justify-between gap-3 group">
          <div className="flex-1 text-left">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="font-semibold text-foreground">Panel de metodologia y fuentes</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Fuentes, escenarios SSP, periodos, confianza y limitaciones del analisis climatico.
            </p>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        <div className="flex flex-wrap gap-1.5 pb-3 pt-2">
          {badgeIds.map((id) => {
            const src = DATA_SOURCES[id];
            if (!src) return null;
            return (
              <Badge key={id} variant="outline" title={src.description} className="text-[10px] py-0.5 px-2 border font-medium">
                {src.icon} {src.label}
              </Badge>
            );
          })}
        </div>
        <div className="pb-3">
          <ScientificReferencesModal />
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pb-4 pt-0">
          <Section title="Fuentes utilizadas">
            {Object.values(DATA_SOURCES).filter((s) => s.type !== "scenario").map((src) => (
              <InfoRow
                key={src.id}
                title={`${src.icon} ${src.label}`}
                badge={src.confidence}
                body={src.description}
                foot={src.institution}
              />
            ))}
          </Section>

          <Section title="Metodo descriptivo">
            <InfoRow
              title="Trazabilidad cientifica"
              badge={metadata?.confidence || "medium"}
              body="La UI muestra senales observadas, proyecciones CMIP6, contexto territorial, fuente, periodo, escenario SSP y nivel de confianza. No genera scores ni rangos financieros."
              foot="Metadata minima: fuente, periodo, escenario, horizonte, confianza y distancia al punto de dato cuando aplica."
            />
          </Section>

          <Section title="Escenarios climaticos SSP">
            {Object.values(SSP_SCENARIOS).map((scenario) => (
              <InfoRow
                key={scenario.code}
                title={`${scenario.code} - ${scenario.name}`}
                badge={scenario.code}
                body={scenario.description}
                foot={`Forzamiento: ${scenario.forcing}; temperatura 2100: ${scenario.temp_range}`}
              />
            ))}
          </Section>

          <Section title="Horizontes temporales">
            {Object.values(TEMPORAL_HORIZONS).map((horizon) => (
              <InfoRow
                key={horizon.key}
                title={horizon.label}
                badge={horizon.period}
                body={horizon.description}
                foot={horizon.use_case}
              />
            ))}
          </Section>

          <Section title="Limitaciones">
            {ANALYSIS_LIMITATIONS.map((item) => (
              <InfoRow key={item.title} title={item.title} badge={item.severity} body={item.description} foot={item.recommendation} />
            ))}
          </Section>

          <Section title="Instituciones responsables">
            {RESPONSIBLE_INSTITUTIONS.map((institution) => (
              <InfoRow key={institution.name} title={institution.name} badge={institution.role} body={institution.scope} foot={institution.url} />
            ))}
          </Section>
        </CardContent>
      )}
    </Card>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-[11px] font-semibold text-secondary-foreground uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ title, badge, body, foot }) {
  return (
    <div className="rounded-lg border border-border bg-secondary p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {badge && <Badge variant="outline" className="text-[9px] py-0 px-1.5 flex-shrink-0">{badge}</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
      {foot && <p className="text-[10px] text-muted-foreground/70">{foot}</p>}
    </div>
  );
}
