// @ts-nocheck
import { Leaf } from "lucide-react";

const EFFECTIVENESS_STYLES = {
  alta:  'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60',
  media: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60',
  baja:  'text-muted-foreground bg-secondary',
};

const TIMEFRAME_LABEL = {
  inmediato: 'Inmediato',
  corto:     'Corto plazo',
  mediano:   'Mediano plazo',
  largo:     'Largo plazo',
};

const PERIOD_CONTEXT_LABEL = {
  historico:     null,
  corto_plazo:   'Para 2020–2039',
  mediano_plazo: 'Para 2040–2059',
  largo_plazo:   'Para 2060–2079',
};

const EFFECTIVENESS_ORDER = { alta: 0, media: 1, baja: 2 };

function collectMeasures(risks) {
  const seen = new Set();
  const result = [];
  for (const risk of risks) {
    for (const m of risk.adaptationMeasures ?? []) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        result.push(m);
      }
    }
  }
  return result.sort(
    (a, b) => (EFFECTIVENESS_ORDER[a.effectiveness] ?? 2) - (EFFECTIVENESS_ORDER[b.effectiveness] ?? 2)
  );
}

export default function AdaptationPanel({ consolidatedRisks, selectedPeriod }) {
  if (!consolidatedRisks?.length) return null;
  if (!selectedPeriod) return null;

  const periodRisks = consolidatedRisks.filter(r => r.period === selectedPeriod);
  const measures = collectMeasures(periodRisks);

  if (!measures.length) {
    if (import.meta.env.DEV) {
      console.warn(
        `[AdaptationPanel] Sin medidas de adaptación para período="${selectedPeriod}". ` +
        `consolidatedRisks.length=${consolidatedRisks.length}. Verificar adaptationMeasures en normalizeRisks().`
      );
    }
    return null;
  }

  const periodContextLabel = selectedPeriod ? PERIOD_CONTEXT_LABEL[selectedPeriod] : null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Leaf className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Medidas de adaptación prioritarias</h3>
        {periodContextLabel && (
          <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary border border-border text-muted-foreground ml-1">
            {periodContextLabel}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {measures.length} acción{measures.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/40">
        {measures.slice(0, 6).map(m => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground leading-snug">{m.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {TIMEFRAME_LABEL[m.timeframe] ?? m.timeframe}
              </p>
            </div>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${EFFECTIVENESS_STYLES[m.effectiveness] ?? EFFECTIVENESS_STYLES.baja}`}
            >
              {m.effectiveness}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
