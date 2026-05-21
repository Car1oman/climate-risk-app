import { CalendarClock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const DEFAULT_EVENTS = [
  "Lluvias intensas y anegamientos urbanos documentados en Lima durante eventos El Nino costero.",
  "Interrupciones operativas historicas asociadas a drenaje urbano, accesos viales y abastecimiento.",
  "Registros GRI y fuentes abiertas usados como contexto territorial, no como ranking financiero.",
];

export default function HistoricalEventsCard({ asset = null, signals = [], traceability = null }) {
  const events = signals.length
    ? signals.slice(0, 4).map((signal) => signal.description || signal.threshold_reference || signal.signalType)
    : DEFAULT_EVENTS;

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historico observado</p>
          <h3 className="text-lg font-semibold mt-1">Senales y eventos cercanos</h3>
        </div>
        <Badge variant="outline" className="gap-1">
          <CalendarClock className="w-3 h-3" />
          1980-2014
        </Badge>
      </div>

      <div className="space-y-2">
        {events.map((event, index) => (
          <div key={`${event}-${index}`} className="flex items-start gap-2 rounded-lg bg-secondary border border-border p-3">
            <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-xs leading-relaxed text-secondary-foreground">{event}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Fuente: {traceability?.source || "GRI, Open-Meteo, registros climaticos regionales"} · Periodo:
        {traceability?.period || " historico de referencia"} · Escenario SSP: no aplica · Confianza:
        {traceability?.confidence || " medium"} · Metadata: {asset?.district || "ubicacion georreferenciada"}
      </p>
    </div>
  );
}
