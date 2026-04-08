import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle, XCircle, Cloud } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const BulkClimateUpload = () => {
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
    const requiredHeaders = ['lat', 'lng', 'recorded_at'];

    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Headers faltantes: ${missingHeaders.join(', ')}`);
    }

    const climateData = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const data = {};
      headers.forEach((header, index) => {
        const value = values[index];
        if (header === 'lat' || header === 'lng' || header === 'temperature' || header === 'humidity' || header === 'wind_kph' || header === 'precipitation') {
          data[header] = value === '' ? null : parseFloat(value);
        } else if (header === 'recorded_at') {
          data[header] = value; // Mantener como string para validación posterior
        } else {
          data[header] = value;
        }
      });

      climateData.push(data);
    }

    return climateData;
  };

  const parseJSON = (jsonText) => {
    const data = JSON.parse(jsonText);
    if (!Array.isArray(data)) {
      throw new Error('El archivo JSON debe contener un array de datos climáticos');
    }
    return data;
  };

  const validateClimateData = (data) => {
    const required = ['lat', 'lng', 'recorded_at'];
    const missing = required.filter(field => data[field] === undefined || data[field] === null || data[field] === '');

    if (missing.length > 0) {
      throw new Error(`Campos requeridos faltantes: ${missing.join(', ')}`);
    }

    // Validar coordenadas
    if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
      throw new Error('Coordenadas inválidas');
    }

    // Validar fecha
    const date = new Date(data.recorded_at);
    if (isNaN(date.getTime())) {
      throw new Error('Fecha recorded_at inválida');
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
      let climateData = [];

      if (file.name.toLowerCase().endsWith('.csv')) {
        climateData = parseCSV(text);
      } else {
        climateData = parseJSON(text);
      }

      if (climateData.length === 0) {
        throw new Error('No se encontraron datos climáticos válidos en el archivo');
      }

      // Validar datos
      const validatedData = [];
      const validationErrors = [];

      climateData.forEach((data, index) => {
        try {
          validatedData.push(validateClimateData(data));
        } catch (error) {
          validationErrors.push({ index, error: error.message });
        }
      });

      if (validationErrors.length > 0) {
        throw new Error(`Errores de validación en ${validationErrors.length} registros. Primer error: ${validationErrors[0].error}`);
      }

      setProgress(25);

      // Procesar en lotes para mejor UX
      const batchSize = 50;
      const totalBatches = Math.ceil(validatedData.length / batchSize);
      let processed = 0;

      const allResults = {
        total: validatedData.length,
        inserted: 0,
        duplicates: 0,
        errors: [],
      };

      for (let i = 0; i < validatedData.length; i += batchSize) {
        const batch = validatedData.slice(i, i + batchSize);

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/climate/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ climateData: batch }),
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
        setProgress(25 + (processed / validatedData.length) * 75);
      }

      setResults(allResults);
      setProgress(100);

      toast({
        title: 'Carga completada',
        description: `${allResults.inserted} registros climáticos insertados, ${allResults.duplicates} duplicados encontrados.`,
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
          <Cloud className="h-5 w-5" />
          Carga Masiva de Datos Climáticos
        </CardTitle>
        <CardDescription>
          Sube un archivo CSV o JSON con datos climáticos históricos. Los datos se usarán para análisis de riesgo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template Download */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const csvContent = 'lat,lng,temperature,humidity,wind_kph,precipitation,source,recorded_at\n-12.0464,-77.0428,25.5,65.0,15.2,0.0,weather_api,2024-01-01T12:00:00Z\n';
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'plantilla_clima.csv';
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
          {uploading ? 'Subiendo...' : 'Subir Datos Climáticos'}
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
                          Registro {error.index + 1}: {error.error}
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
          <div>lat, lng, recorded_at</div>
          <div className="font-medium">Campos opcionales:</div>
          <div>temperature, humidity, wind_kph, precipitation, source</div>
          <div className="mt-1">
            <strong>Nota:</strong> recorded_at debe estar en formato ISO 8601 (ej: 2024-01-01T12:00:00Z)
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkClimateUpload;