import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { API_URL } from "@/lib/api";
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Contar líneas no vacías en un string JSONL/JSON */
const countLines = (text) =>
  text
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

/** Detectar formato a partir del primer carácter no-espacio */
const sniffFormat = (text) => {
  const t = text.trimStart();
  if (t.startsWith("[")) return "json";
  if (t.startsWith("{")) return "jsonl";
  return "desconocido";
};

/** Formatear bytes legibles */
const fmtBytes = (n) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
    ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / 1024 / 1024).toFixed(2)} MB`;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const SAMPLE_JSONL = `{"lat":-12.0464,"lon":-77.0428,"geom":"POINT(-77.0428 -12.0464)","data":{"historical":{"txx":{"median":27.3,"p10":26.1,"p90":28.5}},"ensemble-all-ssp245_2040-2059":{"txx":{"median":28.9,"p10":27.4,"p90":30.2}}}}
{"lat":-8.109,"lon":-79.021,"geom":"POINT(-79.021 -8.109)","data":{"historical":{"txx":{"median":29.1,"p10":28.0,"p90":30.4}},"ensemble-all-ssp585_2040-2059":{"txx":{"median":31.5,"p10":30.2,"p90":32.8}}}}`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClimateDataUpload() {
  const [file, setFile] = useState(null);
  const [fileText, setFileText] = useState(null);
  const [fileMeta, setFileMeta] = useState(null); // { lines, format, bytes }
  const [fileError, setFileError] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  const fileInputRef = useRef(null);

  // ── File selection ──────────────────────────────────────────────────────

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const ext = selected.name.split(".").pop().toLowerCase();
    if (!["jsonl", "json", "txt"].includes(ext)) {
      toast.error("Solo se permiten archivos .jsonl, .json o .txt");
      return;
    }

    if (selected.size > MAX_SIZE_BYTES) {
      toast.error(`El archivo supera el límite de ${MAX_SIZE_MB} MB`);
      return;
    }

    setFile(selected);
    setResult(null);
    setFileError(null);
    setFileMeta(null);
    setFileText(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const format = sniffFormat(text);

      if (format === "desconocido") {
        setFileError(
          "El archivo no comienza con '[' (JSON array) ni con '{' (JSONL). Verifica el formato."
        );
        return;
      }

      const lines = countLines(text);
      setFileText(text);
      setFileMeta({ lines, format, bytes: selected.size });
    };
    reader.onerror = () => setFileError("No se pudo leer el archivo.");
    reader.readAsText(selected, "utf-8");
  };

  // ── Upload ──────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!fileText) return;

    setUploading(true);
    setProgress(10);
    setResult(null);

    try {
      // Simular progreso durante la llamada
      const ticker = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 85));
      }, 400);

      const response = await fetch(`${API_URL}/api/climate-cells/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: fileText, format: "auto" }),
      });

      clearInterval(ticker);
      setProgress(95);

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || json.error || `HTTP ${response.status}`);
      }

      setResult(json);
      setProgress(100);

      const inserted = json.phases?.upsert?.total_processed ?? 0;
      const failed =
        (json.summary?.skipped_invalid ?? 0) +
        (json.phases?.upsert?.upsert_errors?.length ?? 0);

      if (json.success) {
        toast.success(`${inserted} registros cargados correctamente`);
      } else {
        toast.warning(
          `Carga parcial — ${inserted} registros ok, ${failed} con errores`
        );
      }
    } catch (err) {
      toast.error(err.message || "Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────────

  const handleReset = () => {
    setFile(null);
    setFileText(null);
    setFileMeta(null);
    setFileError(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Sample download ─────────────────────────────────────────────────────

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_JSONL], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "muestra_climate_cells.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Importar Datos Climáticos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Carga información climática procesada para enriquecer el análisis de riesgos
        </p>
      </div>

      {/* Format info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Formato esperado (JSONL — una línea por celda)
          </CardTitle>
          <CardDescription>
          Los datos climáticos deben estar en formato estructurado con coordenadas geográficas y variables climáticas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="bg-muted/50 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
{`{"lat":-12.0464,"lon":-77.0428,"geom":"POINT(-77.0428 -12.0464)","data":{"historical":{...},"ensemble-all-ssp245_2040-2059":{...}}}
{"lat":-8.109,"lon":-79.021,"data":{"historical":{...}}}   ← geom se genera automáticamente`}
          </pre>

          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Información requerida</p>
              <p>Coordenadas geográficas (latitud y longitud)</p>
              <p>Datos climáticos históricos y proyectados</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Formatos soportados</p>
              <p>Archivos JSONL o JSON con estructura de datos</p>
              <p>Máximo 50 MB por archivo</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={downloadSample} className="gap-2">
            <FileText className="w-4 h-4" />
            Descargar JSONL de ejemplo
          </Button>
        </CardContent>
      </Card>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Subir archivo JSONL
          </CardTitle>
          <CardDescription>
            Archivos .jsonl, .json o .txt — máximo {MAX_SIZE_MB} MB
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
              accept=".jsonl,.json,.txt"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading}
            />
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              Haz clic para seleccionar un archivo JSONL
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .jsonl · .json · .txt — máx. {MAX_SIZE_MB} MB
            </p>
          </div>

          {/* File selected */}
          {file && (
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 flex-shrink-0 text-primary" />
                <span className="text-sm font-medium truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  ({fmtBytes(file.size)})
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={uploading}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* File error */}
          {fileError && (
            <Alert variant="destructive">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {/* File preview */}
          {fileMeta && !fileError && (
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription className="flex items-center gap-3 flex-wrap">
                <span className="font-medium">Archivo listo</span>
                <Badge variant="secondary">
                  {fileMeta.lines.toLocaleString()} líneas
                </Badge>
                <Badge variant="outline">
                  formato: {fileMeta.format.toUpperCase()}
                </Badge>
                <Badge variant="outline">{fmtBytes(fileMeta.bytes)}</Badge>
              </AlertDescription>
            </Alert>
          )}

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Procesando y cargando en base de datos...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button
            className="w-full gap-2"
            disabled={!fileText || !!fileError || uploading}
            onClick={handleUpload}
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Importando datos..." : "Importar datos climáticos"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary banner */}
          <Alert
            variant={result.success ? "default" : "destructive"}
            className={
              result.success
                ? "border-green-500/40 bg-green-500/5"
                : "border-yellow-500/40 bg-yellow-500/5"
            }
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
            )}
            <AlertDescription className="font-medium">
              {result.success
                ? "Carga completada sin errores"
                : "Carga completada con advertencias — revisa los detalles abajo"}
            </AlertDescription>
          </Alert>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox
              label="Registros procesados"
              value={result.summary?.successfully_processed ?? "—"}
            />
            <StatBox
              label="Datos importados"
              value={result.summary?.total_input_records ?? "—"}
              color="green"
            />
            <StatBox
              label="Errores encontrados"
              value={(result.summary?.skipped_invalid ?? 0) + (result.summary?.database_errors ?? 0)}
              color={((result.summary?.skipped_invalid ?? 0) + (result.summary?.database_errors ?? 0)) > 0 ? "red" : "green"}
            />
            <StatBox
              label="Tiempo de proceso"
              value={result.phases?.upsert?.duration_ms != null ? `${(result.phases.upsert.duration_ms / 1000).toFixed(1)}s` : "—"}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Importación completada el {new Date(result.timestamp).toLocaleString("es-PE")}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({ label, value, color = undefined }) {
  const colorClass =
    color === "green"
      ? "text-green-600 border-green-500/30"
      : color === "red"
      ? "text-red-500 border-red-500/30"
      : color === "yellow"
      ? "text-yellow-600 border-yellow-500/30"
      : "";

  return (
    <div className={`bg-card rounded-lg border p-3 text-center ${colorClass}`}>
      <p className={`text-2xl font-bold ${colorClass ? colorClass.split(" ")[0] : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function PhaseCard({ icon, title, items, errors, highlight }) {
  const hasErrors = errors && errors.length > 0;

  return (
    <Card className={highlight ? "border-primary/20" : ""}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground/80">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          {items.map(([k, v]) => (
            <div key={k}>
              <span className="text-muted-foreground">{k}: </span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>

        {hasErrors && (
          <>
            <Separator />
            <details>
              <summary className="text-xs cursor-pointer text-destructive font-medium">
                Ver errores ({errors.length})
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                {errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80 font-mono break-all">
                    {typeof e === "string" ? e : JSON.stringify(e)}
                  </p>
                ))}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
