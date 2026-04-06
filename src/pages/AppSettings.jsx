import { useState, useEffect } from "react";
import { assets } from "@/data/assets";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw } from "lucide-react";

export default function AppSettings() {
  const { toast } = useToast();
  const [recalculating, setRecalculating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const recalculateAll = async () => {
    setRecalculating(true);
    // Simular recálculo
    setTimeout(() => {
      setRecalculating(false);
      toast({ title: "Recálculo completado", description: `Se recalcularon ${assets.length} activos.` });
    }, 2000);
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestión de activos y motor de scoring</p>
      </div>

      {/* Recalculate */}
      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Recalcular Scores</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recalcula el scoring de riesgo para todos los {assets.length} activos
          </p>
        </div>
        <Button onClick={recalculateAll} disabled={recalculating} variant="outline" className="gap-2">
          {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {recalculating ? "Calculando..." : "Recalcular"}
        </Button>
      </div>

      {/* Info */}
      <div className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm">Activos cargados desde datos locales. Funcionalidad de creación deshabilitada en modo demo.</p>
      </div>
    </div>
  );
}