import { FlaskConical, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const REFERENCES = [
  "IPCC AR6: base fisica y marco de riesgo climatico.",
  "CMIP6: ensamble de modelos para escenarios SSP245 y SSP585.",
  "GRI / WRI Aqueduct: contexto de amenaza fisica y exposicion territorial.",
];

export default function ScientificEvidenceCard({ evidence = null, traceability = null }) {
  const refs = evidence?.references?.length ? evidence.references : REFERENCES;

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Evidencia cientifica</p>
          <h3 className="text-lg font-semibold mt-1">Fuentes y trazabilidad</h3>
        </div>
        <Badge variant="outline">Confianza {evidence?.confidence || traceability?.confidence || "medium"}</Badge>
      </div>

      <div className="space-y-2">
        {refs.map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-3">
            <FlaskConical className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed text-secondary-foreground">{item}</p>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Link2 className="w-3 h-3" />
        Fuente: {traceability?.source || "IPCC AR6, CMIP6, GRI, WRI Aqueduct"} · Periodo:
        {traceability?.period || " historico/proyectado"} · Escenario SSP:
        {traceability?.scenario || " SSP245 / SSP585"} · Metadata cientifica:
        {traceability?.metadata || " fuente, periodo, escenario, horizonte y confianza"}
      </p>
    </div>
  );
}
