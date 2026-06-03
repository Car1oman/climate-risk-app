import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { API_URL, apiFetch } from "@/lib/api";
import {
  Upload, FileText, FileSpreadsheet, Trash2, Download, AlertTriangle,
  FolderOpen, CheckCircle, XCircle, RefreshCw, Filter,
} from "lucide-react";
import { toast } from "sonner";

// ── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = [".pdf", ".xls", ".xlsx", ".doc", ".docx"];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const CATEGORIAS = [
  { value: "riesgo",     label: "Riesgo",      color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "impacto",    label: "Impacto",     color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "adaptacion", label: "Adaptación",  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "informe",    label: "Informe",     color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBytes = (n) =>
  n == null ? "—"
  : n < 1024 ? `${n} B`
  : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB`
  : `${(n / 1024 / 1024).toFixed(2)} MB`;

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

function getFileIcon(tipo) {
  if (!tipo) return <FileText className="w-4 h-4" />;
  if (["xls", "xlsx"].includes(tipo))
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (["doc", "docx"].includes(tipo))
    return <FileText className="w-4 h-4 text-blue-600" />;
  return <FileText className="w-4 h-4 text-red-600" />;  // pdf
}

function getCategoriaCfg(valor) {
  return CATEGORIAS.find((c) => c.value === valor) ?? null;
}

function validateFile(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext))
    return `Tipo no permitido (${ext}). Acepta: ${ALLOWED_EXTENSIONS.join(", ")}`;
  if (file.size > MAX_SIZE_BYTES)
    return `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (máximo ${MAX_SIZE_MB} MB)`;
  return null;
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function DocumentosClimaticos() {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCat, setFilterCat] = useState("todos");

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterCat && filterCat !== "todos"
        ? `${API_URL}/api/documentos?categoria=${filterCat}`
        : `${API_URL}/api/documentos`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar documentos");
      setDocs(await res.json());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterCat]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleDelete = async (id, nombre) => {
    try {
      const res = await apiFetch(`/api/documentos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar");
      }
      toast.success(`"${nombre}" eliminado`);
      fetchDocs();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentos Climáticos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Carga y gestiona reportes, análisis e informes de riesgos climáticos
        </p>
      </div>

      {/* Formulario de subida */}
      <UploadForm onSuccess={fetchDocs} />

      {/* Biblioteca de documentos */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="w-4 h-4" />
                Biblioteca de documentos
              </CardTitle>
              <CardDescription className="mt-0.5">
                {docs.length} documento{docs.length !== 1 ? "s" : ""} almacenados
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Filtro por categoría */}
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las categorías</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchDocs} disabled={loading}>
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Cargando...</div>
          ) : docs.length === 0 ? (
            <EmptyState />
          ) : (
            <DocumentList docs={docs} onDelete={handleDelete} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Formulario de subida ────────────────────────────────────────────────────

function UploadForm({ onSuccess }) {
  const [file, setFile]             = useState(null);
  const [fileError, setFileError]   = useState(null);
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria]   = useState("");
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const err = validateFile(selected);
    setFileError(err);
    setFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    const err = validateFile(dropped);
    setFileError(err);
    setFile(dropped);
  };

  const handleReset = () => {
    setFile(null);
    setFileError(null);
    setDescripcion("");
    setCategoria("");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file || fileError) return;

    setUploading(true);
    setProgress(20);

    try {
      const formData = new FormData();
      formData.append("archivo", file);
      if (descripcion.trim()) formData.append("descripcion", descripcion.trim());
      if (categoria) formData.append("categoria", categoria);

      // Simular progreso mientras espera la respuesta
      const ticker = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 85));
      }, 300);

      const res = await apiFetch("/api/documentos/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(ticker);
      setProgress(100);

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al subir");

      toast.success(`"${json.documento.nombre}" subido correctamente`);
      handleReset();
      onSuccess();
    } catch (err) {
      toast.error(err.message || "Error al subir el documento");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="w-4 h-4" />
          Subir nuevo documento
        </CardTitle>
        <CardDescription>
          Acepta PDF, XLS, XLSX, DOC, DOCX — máximo {MAX_SIZE_MB} MB
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-7 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xls,.xlsx,.doc,.docx"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Arrastra un archivo o haz clic para seleccionarlo</p>
          <p className="text-xs text-muted-foreground mt-1">
            {ALLOWED_EXTENSIONS.join("  ·  ")}
          </p>
        </div>

        {/* Archivo seleccionado */}
        {file && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            fileError ? "border-destructive bg-destructive/5" : "border-border bg-muted/20"
          }`}>
            {getFileIcon(file.name.split(".").pop().toLowerCase())}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
            </div>
            {fileError
              ? <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              : <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            }
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReset} disabled={uploading}>
              <XCircle className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Error de validación */}
        {fileError && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription className="text-xs">{fileError}</AlertDescription>
          </Alert>
        )}

        {/* Campos opcionales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="descripcion" className="text-xs text-muted-foreground">
              Descripción <span className="text-muted-foreground/50">(opcional)</span>
            </Label>
            <Input
              id="descripcion"
              placeholder="Breve descripción del documento..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={uploading}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Categoría <span className="text-muted-foreground/50">(opcional)</span>
            </Label>
            <Select value={categoria} onValueChange={setCategoria} disabled={uploading}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Seleccionar categoría..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Barra de progreso */}
        {uploading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subiendo y registrando...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}

        {/* Botón */}
        <Button
          className="w-full gap-2"
          disabled={!file || !!fileError || uploading}
          onClick={handleUpload}
        >
          <Upload className="w-4 h-4" />
          {uploading ? "Subiendo..." : "Subir documento"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Lista de documentos ────────────────────────────────────────────────────

function DocumentList({ docs, onDelete }) {
  return (
    <div className="divide-y divide-border">
      {docs.map((doc) => (
        <DocumentRow key={doc.id} doc={doc} onDelete={onDelete} />
      ))}
    </div>
  );
}

function DocumentRow({ doc, onDelete }) {
  const cat = getCategoriaCfg(doc.categoria);

  return (
    <div className="flex items-center gap-3 py-3 group">
      {/* Icono */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
        {getFileIcon(doc.tipo)}
      </div>

      {/* Info principal */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate max-w-[280px]">{doc.nombre}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono uppercase">
            {doc.tipo}
          </Badge>
          {cat && (
            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${cat.color}`}>
              {cat.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {doc.descripcion && (
            <span className="text-xs text-muted-foreground truncate max-w-[320px]">
              {doc.descripcion}
            </span>
          )}
          {doc.descripcion && <Separator orientation="vertical" className="h-3" />}
          <span className="text-xs text-muted-foreground">{fmtBytes(doc.tamanio_bytes)}</span>
          <Separator orientation="vertical" className="h-3" />
          <span className="text-xs text-muted-foreground">{fmtDate(doc.created_at)}</span>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Descargar / ver */}
        <a href={doc.url} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
            <Download className="w-4 h-4" />
          </Button>
        </a>

        {/* Eliminar */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará permanentemente <span className="font-medium">"{doc.nombre}"</span>{" "}
                del almacenamiento y de la base de datos. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => onDelete(doc.id, doc.nombre)}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── Estado vacío ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium">No hay documentos</p>
      <p className="text-xs mt-1 opacity-60">Sube el primero usando el formulario de arriba</p>
    </div>
  );
}
