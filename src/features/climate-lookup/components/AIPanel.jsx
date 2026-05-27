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
  const [loading, setLoading] = useState(false);
  const [text, setText]       = useState(null);
  const docCount = docContext?.total || 0;

  const handleGenerate = async () => {
    if (!analysis) return;
    setLoading(true);
    setText(null);
    try {
      const { narrative, risks, signals, metadata } = analysis;
      const summary  = narrative?.executive_summary ?? "";
      const topRisks = (risks ?? []).slice(0, 3).map(r =>
        `- ${r.signal?.signalType ?? "senal climatica"}: ${(r.operational_impacts ?? []).slice(0, 2).join(", ")}`
      ).join("\n");
      const sigCount = signals?.signals_count ?? 0;
      const docSection = docContext?.ai_context ? `\n${docContext.ai_context}\n` : "";

      const prompt = `Eres asesor experto en riesgos climáticos para operaciones de ${metadata?.sector ?? "retail"} en Perú.

Resumen ejecutivo del análisis:
${summary}

Señales detectadas: ${sigCount}
Riesgos principales:
${topRisks || "Sin riesgos detectados"}
${docSection}
Elabora un análisis ejecutivo breve y accionable con:
1. Perfil de riesgo (2–3 oraciones basadas en los datos anteriores)
2. Impactos operacionales más probables para el sector (máx. 4 puntos concretos)
3. Acciones recomendadas${docCount > 0 ? " — cuando sea pertinente, menciona los documentos de referencia disponibles" : ""} (máx. 3 puntos)
Responde en español. Usa lenguaje claro y directo, sin términos técnicos científicos. No inventes datos que no estén en el contexto.`;

      const res  = await apiFetch('/api/ai', {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al generar recomendaciones");
      const result = typeof data === "string" ? data : data.response ?? "";
      if (!result) throw new Error("La IA no devolvió texto. Intenta de nuevo.");
      setText(result);
    } catch (err) {
      toast.error(err.message || "Error al generar recomendaciones");
    } finally {
      setLoading(false);
    }
  };

  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

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
            {docCount} documento{docCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!text ? (
        <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={loading || !analysis}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA...</>
            : <><Sparkles className="w-4 h-4" />Generar recomendaciones</>}
        </Button>
      ) : parsed ? (
        <AIAnalysisView data={parsed} onReset={() => setText(null)} />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-semibold text-foreground">Análisis IA</p>
              <span className="rounded-full bg-primary/15 dark:bg-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">IA</span>
            </div>
            <div className="text-sm leading-6 text-foreground whitespace-pre-wrap">{text}</div>
          </div>
          <ButtonsFooter onReset={() => setText(null)} />
        </div>
      )}
    </div>
  );
}
