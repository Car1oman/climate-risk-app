import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { API_URL } from "@/lib/api";
import { exportEnterprisePdf } from "@/lib/enterprisePdfReport";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Report() {
  const [isLoading, setIsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [report, setReport] = useState(null);
  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useAssets();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const totalAssets = assets.length;
      const locatedAssets = assets.filter((a) => a.lat && a.lng).length;
      const districts = new Set(assets.map((a) => a.district).filter(Boolean)).size;

      const assetsWithSignals = [...assets]
        .sort((a, b) => String(a.district || "").localeCompare(String(b.district || "")))
        .slice(0, 5)
        .map((a) => `- ${a.name} (${a.district}): senal observada: ${a.top_risk || "sin senal registrada"}, fuente esperada: GRI / CMIP6 / Open-Meteo`)
        .join("\n");

      const prompt = `Eres un experto en reportes TCFD (Task Force on Climate-Related Financial Disclosures) y ESRS (European Sustainability Reporting Standards).

Genera un reporte ejecutivo TCFD/ESRS para Intercorp Retail (SPSA) basado en estos datos descriptivos:

DATOS DEL PORTAFOLIO:
- Total de activos monitoreados: ${totalAssets}
- Activos georreferenciados: ${locatedAssets}
- Distritos cubiertos: ${districts}
- Fuentes cientificas: CMIP6, IPCC AR6, GRI, WRI Aqueduct, Open-Meteo
- Escenarios climaticos: SSP245 y SSP585
- Periodos: historico 1980-2014; proyeccion 2020-2059

ACTIVOS CON SENALES PARA REVISAR:
${assetsWithSignals}

CONTEXTO:
- Los riesgos climaticos principales son inundacion fluvial, fenomeno El Nino, calor extremo, deslizamientos y sequia hidrica.
- Los activos estan ubicados en Lima Metropolitana, Peru.
- El fenomeno El Nino es un riesgo ciclico recurrente.

Genera el reporte en formato TCFD con las secciones:
1. Gobernanza
2. Estrategia
3. Gestion de riesgos
4. Metricas y objetivos

Formato Markdown. No uses scores, rankings numericos, urgencia numerica ni rangos de impacto financiero. Se especifico con fuentes, periodos, escenarios SSP, niveles de confianza y recomendaciones accionables.`;

      const response = await fetch(`${API_URL}/api/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Error al generar el reporte");

      const text = typeof result === "string" ? result : result.response ?? "";
      if (!text) throw new Error("La IA no devolvio contenido. Intenta de nuevo.");
      setReport(text);
    } catch (error) {
      console.error("Error generating report:", error);
      setReport(`**Error:** ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const exportPdf = () => {
    setExportingPdf(true);
    try {
      exportEnterprisePdf({ assets, generatedReport: report });
      toast.success("Reporte PDF listo para exportar");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("No se pudo preparar el PDF");
    } finally {
      setTimeout(() => setExportingPdf(false), 600);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reporte TCFD / ESRS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reportes climaticos basados en evidencia, fuente y escenario SSP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={exportPdf}
            disabled={exportingPdf || assetsLoading || assetsError || assets.length === 0}
            className="gap-2"
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exportingPdf ? "Preparando..." : "Exportar PDF"}
          </Button>
          <Button onClick={generateReport} disabled={generating || assetsError || assets.length === 0} className="gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generating ? "Generando..." : "Generar reporte"}
          </Button>
        </div>
      </div>

      {assetsError && (
        <div className="rounded-xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          No se pudieron cargar los activos desde el backend.
        </div>
      )}

      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-4">
        <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">Reporte Ejecutivo PDF Enterprise</p>
        <p className="text-xs text-blue-800 dark:text-blue-200 mt-1">
          La exportacion incluye resumen ejecutivo, senales observadas, escenarios SSP, fuentes, metodologia,
          limitaciones, bibliografia cientifica y nivel de confianza.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Activos" value={assets.length} />
        <Metric label="Georreferenciados" value={assets.filter((a) => a.lat && a.lng).length} tone="text-sky-400" />
        <Metric label="Distritos" value={new Set(assets.map((a) => a.district).filter(Boolean)).size} />
        <Metric label="Escenarios" value="2" tone="text-emerald-400" />
      </div>

      {report ? (
        <div className="bg-card border border-border rounded-xl p-8">
          <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap text-foreground/90">
            {report}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Genera un reporte TCFD/ESRS basado en senales climaticas, fuentes y trazabilidad.
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-mono font-bold mt-1 ${tone}`}>{value}</p>
    </div>
  );
}
