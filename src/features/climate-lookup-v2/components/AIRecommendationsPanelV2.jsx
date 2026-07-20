import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { generateV2Recommendations } from "@/lib/apiV2";

/**
 * AIRecommendationsPanelV2 — auditoría de brecha funcional (D1 §6) + plan de
 * implementación Fase 6. Reusa el sistema de IA con guardrails científicos
 * ya construido para V1 (server/routes/ai.js SCIENTIFIC_SYSTEM_PROMPT +
 * validateAIOutput) a través de la nueva ruta /api/ai/analyze-v2, que
 * consume ÚNICAMENTE resultados ya calculados por el pipeline V2
 * (executive_summary, phenomena[] con horizon/scenario/recommendation,
 * phenomena_not_detected[]) — nunca variables canónicas crudas.
 *
 * Estado de "información insuficiente" explícito (Fase 6, regla): si el
 * backend responde 422 INSUFFICIENT_CONTEXT, se muestra tal cual en vez de
 * reintentar con un prompt vacío o mostrar un error genérico.
 */
export default function AIRecommendationsPanelV2({ response, sector }) {
  const [loading, setLoading]     = useState(false);
  const [parsed, setParsed]       = useState(null);
  const [insufficient, setInsufficient] = useState(null);
  const [errorMsg, setErrorMsg]   = useState(null);

  const handleReset = () => { setParsed(null); setInsufficient(null); setErrorMsg(null); };

  const handleGenerate = async () => {
    if (!response) return;
    setLoading(true);
    setErrorMsg(null);
    setInsufficient(null);
    setParsed(null);

    try {
      const payload = {
        location: response.location,
        sector,
        scenarioLabel: response.scenario_requested_label,
        executiveSummary: response.executive_summary,
        confidenceNote: response.confidence_note,
        overallRisk: response.overall_risk,
        phenomena: response.phenomena,
        phenomenaNotDetected: response.phenomena_not_detected,
        recommendations: response.recommendations,
      };

      const body = await generateV2Recommendations(payload);
      const stripped = (body.response || "")
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      try {
        setParsed(JSON.parse(stripped));
      } catch {
        setErrorMsg("La IA respondió, pero el formato no pudo interpretarse. Intenta regenerar.");
      }
    } catch (err) {
      if (err.code === "INSUFFICIENT_CONTEXT") {
        setInsufficient(err.message);
      } else {
        toast.error(err.message || "Error al generar recomendaciones");
        setErrorMsg(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
              Recomendaciones con IA
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contextualiza los resultados de este análisis para el negocio — no reemplaza validación experta.
            </p>
          </div>
        </div>

        {insufficient ? (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{insufficient}</span>
          </div>
        ) : !parsed && !loading ? (
          <Button className="w-full gap-2" size="sm" onClick={handleGenerate} disabled={!response}>
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Generar recomendaciones
          </Button>
        ) : loading ? (
          <Button className="w-full gap-2" size="sm" disabled>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            Analizando con IA...
          </Button>
        ) : parsed ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-secondary p-4 shadow-sm space-y-3">
              {parsed.contextualSummary && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Contexto</p>
                  <p className="text-sm leading-6 text-foreground">{parsed.contextualSummary}</p>
                </div>
              )}
              {parsed.operationalImplications?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Implicancias operacionales</p>
                  <ul className="space-y-1">
                    {parsed.operationalImplications.map((item, i) => (
                      <li key={i} className="text-sm leading-5 text-foreground flex items-start gap-2">
                        <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.adaptationFraming && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dirección de adaptación</p>
                  <p className="text-sm leading-6 text-foreground">{parsed.adaptationFraming}</p>
                </div>
              )}
              {parsed.confidenceStatement && (
                <p className="text-[11px] text-primary font-medium">{parsed.confidenceStatement}</p>
              )}
              {parsed.disclaimer && (
                <p className="text-[11px] leading-5 text-muted-foreground italic border-t border-border/40 pt-3">
                  {parsed.disclaimer}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="secondary" onClick={handleReset}>Regenerar</Button>
              <p className="text-[11px] text-muted-foreground">Valida las acciones con tu equipo técnico.</p>
            </div>
          </div>
        ) : errorMsg ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={handleReset}>Reintentar</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
