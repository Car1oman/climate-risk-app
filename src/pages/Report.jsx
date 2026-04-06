import { useState, useEffect } from "react";
import { assets } from "@/data/assets";
import { formatCurrency, getRiskColor } from "@/lib/riskEngine";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";

const RISK_LABELS = { critico: "Crítico", alto: "Alto", medio: "Medio", bajo: "Bajo" };

export default function Report() {
  const [isLoading, setIsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const totalAssets = assets.length;
      const criticalCount = assets.filter((a) => a.risk_level === "critico").length;
      const highCount = assets.filter((a) => a.risk_level === "alto").length;
      const totalImpact = assets.reduce((s, a) => s + (a.financial_impact || 0), 0);

      const topRisks = [...assets]
        .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
        .slice(0, 5)
        .map((a) => `- ${a.name} (${a.district}): Score ${((a.risk_score || 0) * 100).toFixed(0)}, Riesgo principal: ${a.top_risk || "N/A"}, Impacto: S/ ${(a.financial_impact || 0).toLocaleString()}`)
        .join("\n");

      const prompt = `Eres un experto en reportes TCFD (Task Force on Climate-Related Financial Disclosures) y ESRS (European Sustainability Reporting Standards).

Genera un reporte ejecutivo TCFD/ESRS para Intercorp Retail (SPSA) basado en los siguientes datos del portafolio:

DATOS DEL PORTAFOLIO:
- Total de activos monitoreados: ${totalAssets}
- Activos en riesgo crítico: ${criticalCount}
- Activos en riesgo alto: ${highCount}
- Impacto financiero total estimado: S/ ${totalImpact.toLocaleString()}

TOP 5 ACTIVOS DE MAYOR RIESGO:
${topRisks}

CONTEXTO:
- Los riesgos climáticos principales son: inundación fluvial, fenómeno El Niño, sismos, deslizamientos y sequía hídrica.
- Los activos están ubicados en Lima Metropolitana, Perú.
- El fenómeno El Niño es un riesgo cíclico recurrente (próximo ~2026).

Genera el reporte en formato TCFD con las secciones:
1. Gobernanza
2. Estrategia (riesgos físicos y de transición)
3. Gestión de riesgos
4. Métricas y objetivos

Formato Markdown. Sé específico con los datos proporcionados. Incluye recomendaciones accionables.`;

      const response = await fetch('http://localhost:3001/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Error al generar el reporte');
      }

      const result = await response.text();
      setReport(result);
    } catch (error) {
      console.error('Error generating report:', error);
      setReport('Error al generar el reporte. Asegúrate de que el servidor backend esté ejecutándose.');
    } finally {
      setGenerating(false);
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
            Genera reportes compatibles con marcos de divulgación climática
          </p>
        </div>
        <Button onClick={generateReport} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {generating ? "Generando..." : "Generar Reporte"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Activos</p>
          <p className="text-xl font-mono font-bold mt-1">{assets.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Crítico/Alto</p>
          <p className="text-xl font-mono font-bold mt-1 text-red-400">
            {assets.filter((a) => a.risk_level === "critico" || a.risk_level === "alto").length}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Impacto Total</p>
          <p className="text-xl font-mono font-bold mt-1">{formatCurrency(assets.reduce((s, a) => s + (a.financial_impact || 0), 0))}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Cobertura</p>
          <p className="text-xl font-mono font-bold mt-1 text-emerald-400">100%</p>
        </div>
      </div>

      {/* Report Content */}
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
            Haz clic en "Generar Reporte" para crear un reporte TCFD/ESRS basado en tu portafolio actual.
          </p>
        </div>
      )}
    </div>
  );
}