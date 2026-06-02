// @ts-nocheck
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, BookOpen } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

function AISection({ icon, label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
        <span className="text-primary">{icon}</span>
        {label}
      </p>
      {children}
    </div>
  );
}

function AIBulletList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-sm leading-5 text-foreground flex items-start gap-2">
          <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function AIAnalysisView({ data, onReset }) {
  const isEmpty = !data?.contextualSummary && !data?.operationalImplications?.length;

  if (isEmpty) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-foreground">Análisis IA</p>
            <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
          </div>
          <p className="text-sm text-muted-foreground italic">No se pudo estructurar la respuesta.</p>
        </div>
        <ButtonsFooter onReset={onReset} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            Análisis IA
          </p>
          {data.confidenceStatement && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary border border-primary/20">
              {data.confidenceStatement}
            </span>
          )}
        </div>

        {data.contextualSummary && (
          <AISection icon={<Sparkles className="w-3 h-3" />} label="PERFIL DE RIESGO">
            <p className="text-sm leading-6 text-foreground">{data.contextualSummary}</p>
          </AISection>
        )}

        {data.operationalImplications?.length > 0 && (
          <AISection icon={<Sparkles className="w-3 h-3" />} label="IMPACTOS OPERACIONALES">
            <AIBulletList items={data.operationalImplications} />
          </AISection>
        )}

        {data.adaptationFraming && (
          <AISection icon={<Sparkles className="w-3 h-3" />} label="ACCIÓN RECOMENDADA">
            <p className="text-sm leading-6 text-foreground">{data.adaptationFraming}</p>
          </AISection>
        )}

        {data.disclaimer && (
          <p className="text-[11px] leading-5 text-muted-foreground italic border-t border-border/40 pt-3">
            {data.disclaimer}
          </p>
        )}
      </div>
      <ButtonsFooter onReset={onReset} />
    </div>
  );
}

function ButtonsFooter({ onReset }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button size="sm" variant="secondary" onClick={onReset}>Regenerar</Button>
      <p className="text-[11px] text-muted-foreground">Valida las acciones con tu equipo técnico.</p>
    </div>
  );
}

export default function AIPanel({ analysis, docContext }) {
  const [loading, setLoading]           = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [parsed, setParsed]             = useState(null);
  const docCount = docContext?.total || 0;

  const handleReset = () => { setStreamedText(''); setParsed(null); };

  const handleGenerate = async () => {
    if (!analysis) return;
    setLoading(true);
    setStreamedText('');
    setParsed(null);

    try {
      const { narrative, risks, signals, metadata } = analysis;

      // Enviar datos estructurados al backend — el prompt se construye en el servidor.
      // Usa /api/ai/stream para recibir la respuesta progresivamente (sin spinner ciego).
      const res = await apiFetch('/api/ai/stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ narrative, risks, signals, metadata, docContext }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || 'Error al generar análisis');
      }

      // Leer el stream chunk a chunk y mostrar el texto en tiempo real
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setStreamedText(accumulated);
      }

      // Intentar parsear JSON al finalizar (strip de fencing por si acaso)
      const stripped = accumulated.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      try { setParsed(JSON.parse(stripped)); } catch { setParsed(null); }

    } catch (err) {
      toast.error(err.message || 'Error al generar recomendaciones');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <Sparkles className="w-4 h-4 text-primary" />
            Recomendaciones con IA
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Análisis generado a partir de los datos de riesgo detectados.
          </p>
        </div>
        {docCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold text-secondary-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            {docCount} documento{docCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!streamedText && !loading ? (
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={!analysis}>
          <Sparkles className="w-4 h-4" />
          Generar recomendaciones
        </Button>
      ) : loading && !streamedText ? (
        <Button className="w-full gap-2" size="sm" disabled>
          <Loader2 className="w-4 h-4 animate-spin" />
          Conectando con IA...
        </Button>
      ) : loading ? (
        // Streaming en progreso — mostrar texto parcial con cursor animado
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Analizando con IA...
              </p>
              <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
            </div>
            <div className="text-sm leading-6 text-foreground whitespace-pre-wrap">
              {streamedText}
              <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
            </div>
          </div>
        </div>
      ) : parsed ? (
        <AIAnalysisView data={parsed} onReset={handleReset} />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-foreground">Análisis IA</p>
              <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
            </div>
            <div className="text-sm leading-6 text-foreground whitespace-pre-wrap">{streamedText}</div>
          </div>
          <ButtonsFooter onReset={handleReset} />
        </div>
      )}
    </div>
  );
}
