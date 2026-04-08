import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BulkAssetUpload = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.csv') && !selectedFile.name.toLowerCase().endsWith('.json')) {
        toast({
          title: 'Archivo inválido',
          description: 'Solo se permiten archivos CSV o JSON.',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
      setResults(null);
    }
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['name', 'type', 'district', 'lat', 'lng', 'monthly_sales', 'condition'];

    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Headers faltantes: ${missingHeaders.join(', ')}`);
    }

    const assets = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const asset = {};
      headers.forEach((header, index) => {
        const value = values[index];
        if (header === 'lat' || header === 'lng' || header === 'monthly_sales' || header === 'area_m2' || header === 'num_employees') {
          asset[header] = value === '' ? null : parseFloat(value);
        } else {
          asset[header] = value;
        }
      });

      assets.push(asset);
    }

    return assets;
  };

  const parseJSON = (jsonText) => {
    const data = JSON.parse(jsonText);
    if (!Array.isArray(data)) {
      throw new Error('El archivo JSON debe contener un array de activos');
    }
    return data;
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResults(null);

    try {
      const text = await file.text();
      let assets = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        assets = parseCSV(text);
      } else {
        assets = parseJSON(text);
      }

      if (assets.length === 0) {
        throw new Error('No se encontraron activos válidos en el archivo');
      }

      setProgress(25);

      // Procesar en lotes para mejor UX
      const batchSize = 10;
      const totalBatches = Math.ceil(assets.length / batchSize);
      let processed = 0;

      const allResults = {
        total: assets.length,
        inserted: 0,
        duplicates: 0,
        errors: [],
      };

      for (let i = 0; i < assets.length; i += batchSize) {
        const batch = assets.slice(i, i + batchSize);

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/assets/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ assets: batch }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Error en la carga masiva');
        }

        const batchResult = await response.json();
        allResults.inserted += batchResult.inserted;
        allResults.duplicates += batchResult.duplicates;
        allResults.errors.push(...batchResult.errors);

        processed += batch.length;
        setProgress(25 + (processed / assets.length) * 75);
      }

      setResults(allResults);
      setProgress(100);

      toast({
        title: 'Carga completada',
        description: `${allResults.inserted} activos insertados, ${allResults.duplicates} duplicados encontrados.`,
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Error en la carga',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setFile(null);
    setResults(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Carga Masiva de Activos
        </CardTitle>
        <CardDescription>
          Sube un archivo CSV o JSON con múltiples activos. El archivo debe contener las columnas requeridas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template Download */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csvContent = 'name,type,district,lat,lng,monthly_sales,area_m2,num_employees,condition\nTienda Centro,Retail,Lima,-12.0464,-77.0428,50000,150,5,Excelente\n';
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'plantilla_activos.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <FileText className="h-4 w-4 mr-2" />
            Descargar Plantilla CSV
          </Button>
        </div>

        {/* File Selection */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileSelect}
            className="hidden"
            disabled={uploading}
          />
          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-gray-400" />
            <div>
              <Button
                variant="link"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="p-0 h-auto font-medium"
              >
                Seleccionar archivo
              </Button>
              <p className="text-sm text-gray-500">o arrastra y suelta aquí</p>
            </div>
            <p className="text-xs text-gray-400">CSV o JSON (máx. 10MB)</p>
          </div>
        </div>

        {/* Selected File */}
        {file && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetUpload}
              disabled={uploading}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Procesando...</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full"
        >
          {uploading ? 'Subiendo...' : 'Subir Activos'}
        </Button>

        {/* Results */}
        {results && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium">Carga completada</div>
                <div className="text-sm space-y-1">
                  <div>Total procesados: {results.total}</div>
                  <div className="text-green-600">Insertados: {results.inserted}</div>
                  <div className="text-yellow-600">Duplicados: {results.duplicates}</div>
                  {results.errors.length > 0 && (
                    <div className="text-red-600">Errores: {results.errors.length}</div>
                  )}
                </div>
                {results.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium">Ver errores</summary>
                    <div className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
                      {results.errors.map((error, index) => (
                        <div key={index} className="text-red-600">
                          Línea {error.index + 1}: {error.error}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Required Fields Info */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="font-medium">Campos requeridos:</div>
          <div>name, type, district, lat, lng, monthly_sales, condition</div>
          <div className="font-medium">Campos opcionales:</div>
          <div>area_m2, num_employees</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkAssetUpload;