import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { API_URL } from "@/lib/api";
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Download,
  CloudUpload,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

const SAMPLE_JSON = {
  metadata: {
    source: "World Bank Climate Change Knowledge Portal",
    description: "Climate risk grid data for Peru",
    generated_at: new Date().toISOString(),
  },
  data: [
    {
      lat: -12.0464,
      lng: -77.0428,
      risk_type: "flood",
      horizon: "2050",
      level: "high",
      value: 0.82,
    },
    {
      lat: -8.109,
      lng: -79.021,
      risk_type: "drought",
      horizon: "2030",
      level: "medium",
      value: 0.54,
    },
    {
      lat: -13.528,
      lng: -71.972,
      risk_type: "heatwave",
      horizon: "2080",
      level: "low",
      value: 0.21,
    },
  ],
};

export default function ClimateDataUpload() {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith(".json")) {
      toast.error("Solo se permiten archivos JSON");
      return;
    }

    setFile(selected);
    setResults(null);
    setParseError(null);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);

        if (!json.data || !Array.isArray(json.data)) {
          setParseError('El archivo JSON debe tener un campo "data" con un array de registros.');
          return;
        }

        setParsedData(json);
      } catch {
        setParseError("El archivo no es un JSON válido.");
      }
    };
    reader.readAsText(selected);
  };

  const handleUpload = async () => {
    if (!parsedData) return;

    setUploading(true);
    setProgress(0);
    setResults(null);

    const BATCH_SIZE = 500;
    const batches = Math.ceil(parsedData.data.length / BATCH_SIZE);
    setTotalBatches(batches);
    setCurrentBatch(0);

    try {
      const response = await fetch(`${API_URL}/api/climate-risks/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsedData.data }),
      });

      // Simulate batch progress for UX feedback
      for (let b = 1; b <= batches; b++) {
        setCurrentBatch(b);
        setProgress(Math.round((b / batches) * 100));
        await new Promise((r) => setTimeout(r, 150));
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error al subir los datos");
      }

      const result = await response.json();
      setResults(result);
      setProgress(100);
      toast.success(`Datos cargados correctamente — versión ${result.datasetVersion}`);
    } catch (error) {
      toast.error(error.message || "Error al subir los datos");
    } finally {
      setUploading(false);
      setCurrentBatch(0);
      setTotalBatches(0);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedData(null);
    setParseError(null);
    setResults(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadSample = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "world_bank_climate_sample.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Gestión de Datos Climáticos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Carga datos del Banco Mundial hacia la grilla de riesgo climático
        </p>
      </div>

      {/* Expected structure */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Estructura esperada del JSON
          </CardTitle>
          <CardDescription>
            El archivo debe contener un objeto con los campos{" "}
            <code className="text-xs bg-muted px-1 rounded">metadata</code> y{" "}
            <code className="text-xs bg-muted px-1 rounded">data[]</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="bg-muted/50 text-xs rounded-lg p-4 overflow-x-auto text-foreground/80 leading-relaxed">
{`{
  "metadata": { ... },   // opcional, info descriptiva
  "data": [
    {
      "lat": number,        // requerido, -90 a 90
      "lng": number,        // requerido, -180 a 180
      "risk_type": string,  // requerido  (ej: "flood", "drought")
      "horizon": string,    // requerido  (ej: "2030", "2050", "2080")
      "level": string,      // requerido  (ej: "low", "medium", "high")
      "value": number,      // recomendado (0.0 - 1.0)
      "source": string      // opcional, default: "world_bank"
    }
  ]
}`}
          </pre>
          <Button variant="outline" size="sm" onClick={downloadSample} className="gap-2">
            <Download className="w-4 h-4" />
            Descargar JSON de ejemplo
          </Button>
        </CardContent>
      </Card>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5" />
            Subir archivo JSON
          </CardTitle>
          <CardDescription>
            Selecciona un archivo JSON exportado del Banco Mundial o compatible con la estructura mostrada
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              Haz clic para seleccionar un archivo JSON
            </p>
            <p className="text-xs text-muted-foreground mt-1">Solo archivos .json</p>
          </div>

          {/* Selected file */}
          {file && (
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 flex-shrink-0 text-primary" />
                <span className="text-sm font-medium truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={uploading}>
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Preview stats */}
          {parsedData && !parseError && (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription className="flex items-center gap-3 flex-wrap">
                <span className="font-medium">Archivo válido</span>
                <Badge variant="secondary">{parsedData.data.length} registros</Badge>
                <span className="text-muted-foreground text-xs">
                  ~{Math.ceil(parsedData.data.length / 500)} lote(s) de 500
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {totalBatches > 0
                    ? `Insertando lote ${currentBatch} de ${totalBatches}...`
                    : "Procesando..."}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Upload button */}
          <Button
            className="w-full gap-2"
            disabled={!parsedData || !!parseError || uploading}
            onClick={handleUpload}
          >
            <CloudUpload className="w-4 h-4" />
            {uploading ? "Subiendo data..." : "Subir data climática"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              Carga completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-card rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{results.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total recibidos</p>
              </div>
              <div className="bg-card rounded-lg border border-green-500/30 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{results.inserted}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Insertados</p>
              </div>
              <div className="bg-card rounded-lg border border-red-500/30 p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{results.errors}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Errores / Omitidos</p>
              </div>
              <div className="bg-card rounded-lg border p-3 text-center">
                <p className="text-sm font-mono font-semibold truncate">{results.datasetVersion}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Versión activa</p>
              </div>
            </div>
            {results.errors > 0 && (
              <Alert variant="destructive" className="border-red-500/30 bg-red-500/5">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="text-sm">
                  {results.errors} registro(s) fueron omitidos por coordenadas inválidas o campos faltantes
                  (risk_type, horizon, level).
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              La versión <code className="bg-muted px-1 rounded">{results.datasetVersion}</code> es
              ahora la versión activa en <code className="bg-muted px-1 rounded">climate_dataset_control</code>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
