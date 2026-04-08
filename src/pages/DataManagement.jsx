import { useState, useEffect } from "react";
import { useAssets } from "@/hooks/useAssets";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Download, Plus, Edit, Trash2, FileText, Database } from "lucide-react";
import { formatCurrency, getRiskColor } from "@/lib/riskEngine";
import BulkAssetUpload from "@/components/BulkAssetUpload";
import BulkClimateUpload from "@/components/BulkClimateUpload";

const TYPE_OPTIONS = [
  { value: "supermercado_grande", label: "Supermercado Grande" },
  { value: "supermercado_mediano", label: "Supermercado Mediano" },
  { value: "centro_distribucion", label: "Centro de Distribución" },
  { value: "tienda_express", label: "Tienda Express" },
];

const CONDITION_OPTIONS = [
  { value: "propio", label: "Propio" },
  { value: "alquilado", label: "Alquilado" },
];

export default function DataManagement() {
  const [activeTab, setActiveTab] = useState("assets");
  const { data: assets = [], refetch } = useAssets();

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestión de Datos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Registra y administra activos y datos externos de la plataforma
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="assets" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Activos
          </TabsTrigger>
          <TabsTrigger value="external" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Datos Externos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          <AssetsTab assets={assets} refetch={refetch} />
        </TabsContent>

        <TabsContent value="external" className="space-y-6">
          <ExternalDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssetsTab({ assets, refetch }) {
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activos Registrados</h2>
          <p className="text-sm text-muted-foreground">
            {assets.length} activos en total
          </p>
        </div>
        <Button onClick={() => setShowManualForm(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Registrar Activo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro Manual</CardTitle>
          <CardDescription>
            Agrega un activo individualmente con validación de duplicados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ManualAssetForm
            isOpen={showManualForm}
            onClose={() => setShowManualForm(false)}
            editingAsset={editingAsset}
            onSuccess={() => {
              refetch();
              setShowManualForm(false);
              setEditingAsset(null);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carga Masiva</CardTitle>
          <CardDescription>
            Sube múltiples activos desde un archivo CSV o JSON
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkAssetUpload />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Activos</CardTitle>
          <CardDescription>
            Gestiona tus activos con operaciones CRUD
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssetsTable assets={assets} refetch={refetch} onEdit={setEditingAsset} />
        </CardContent>
      </Card>
    </div>
  );
}

function AssetsTable({ assets, refetch, onEdit }) {
  const handleDelete = async (assetId) => {
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Error al eliminar el activo');
      }

      toast.success('Activo eliminado exitosamente');
      refetch();
    } catch (error) {
      console.error('Error deleting asset:', error);
      toast.error(error.message || 'Error al eliminar el activo');
    }
  };

  const getConditionColor = (condition) => {
    switch (condition?.toLowerCase()) {
      case 'excelente':
        return 'bg-green-100 text-green-800';
      case 'bueno':
        return 'bg-blue-100 text-blue-800';
      case 'regular':
        return 'bg-yellow-100 text-yellow-800';
      case 'malo':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (assets.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay activos registrados. Crea el primero usando el formulario de registro manual.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Distrito</TableHead>
          <TableHead>Ubicación</TableHead>
          <TableHead>Ventas Mensuales</TableHead>
          <TableHead>Área (m²)</TableHead>
          <TableHead>Empleados</TableHead>
          <TableHead>Condición</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => (
          <TableRow key={asset.id}>
            <TableCell className="font-medium">{asset.name}</TableCell>
            <TableCell>{asset.type}</TableCell>
            <TableCell>{asset.district}</TableCell>
            <TableCell>
              <div className="text-sm">
                {asset.lat?.toFixed(4)}, {asset.lng?.toFixed(4)}
              </div>
            </TableCell>
            <TableCell>{formatCurrency(asset.monthly_sales)}</TableCell>
            <TableCell>{asset.area_m2 || '-'}</TableCell>
            <TableCell>{asset.num_employees || '-'}</TableCell>
            <TableCell>
              <Badge className={getConditionColor(asset.condition)}>
                {asset.condition}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(asset)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar activo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente el activo "{asset.name}".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(asset.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ExternalDataTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Carga de Datos Externos</CardTitle>
          <CardDescription>
            Sube datos climáticos o geoespaciales desde archivos CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkClimateUpload />
        </CardContent>
      </Card>
    </div>
  );
}

function ManualAssetForm({ isOpen, onClose, editingAsset, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    district: "",
    lat: "",
    lng: "",
    monthly_sales: "",
    area_m2: "",
    num_employees: "",
    condition: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingAsset) {
      setFormData({
        name: editingAsset.name || "",
        type: editingAsset.type || "",
        district: editingAsset.district || "",
        lat: editingAsset.lat?.toString() || "",
        lng: editingAsset.lng?.toString() || "",
        monthly_sales: editingAsset.monthly_sales?.toString() || "",
        area_m2: editingAsset.area_m2?.toString() || "",
        num_employees: editingAsset.num_employees?.toString() || "",
        condition: editingAsset.condition || "",
      });
    } else {
      setFormData({
        name: "",
        type: "",
        district: "",
        lat: "",
        lng: "",
        monthly_sales: "",
        area_m2: "",
        num_employees: "",
        condition: "",
      });
    }
    setErrors({});
  }, [editingAsset, isOpen]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = "Nombre es obligatorio";
    if (!formData.type) newErrors.type = "Tipo es obligatorio";
    if (!formData.district.trim()) newErrors.district = "Distrito es obligatorio";
    if (!formData.condition) newErrors.condition = "Condición es obligatoria";

    const lat = parseFloat(formData.lat);
    const lng = parseFloat(formData.lng);
    if (isNaN(lat) || lat < -90 || lat > 90) newErrors.lat = "Latitud debe ser un número entre -90 y 90";
    if (isNaN(lng) || lng < -180 || lng > 180) newErrors.lng = "Longitud debe ser un número entre -180 y 180";

    const monthlySales = parseFloat(formData.monthly_sales);
    if (isNaN(monthlySales) || monthlySales < 0) newErrors.monthly_sales = "Ventas mensuales deben ser un número >= 0";

    const area = parseFloat(formData.area_m2);
    if (formData.area_m2 && (isNaN(area) || area <= 0)) newErrors.area_m2 = "Área debe ser un número > 0";

    const employees = parseInt(formData.num_employees);
    if (formData.num_employees && (isNaN(employees) || employees < 0)) newErrors.num_employees = "Número de empleados debe ser un entero >= 0";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkDuplicate = async () => {
    try {
      const response = await fetch(`${API_URL}/api/assets/check-duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          lat: parseFloat(formData.lat),
          lng: parseFloat(formData.lng),
          excludeId: editingAsset?.id,
        }),
      });
      const result = await response.json();
      return result.exists;
    } catch (error) {
      console.error('Error checking duplicate:', error);
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const isDuplicate = await checkDuplicate();
      if (isDuplicate) {
        toast.error("Este activo ya existe. Verifica antes de registrar para evitar duplicidad.");
        setIsSubmitting(false);
        return;
      }

      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        district: formData.district.trim(),
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        monthly_sales: parseFloat(formData.monthly_sales),
        area_m2: formData.area_m2 ? parseFloat(formData.area_m2) : null,
        num_employees: formData.num_employees ? parseInt(formData.num_employees) : null,
        condition: formData.condition,
      };

      const url = editingAsset ? `${API_URL}/api/assets/${editingAsset.id}` : `${API_URL}/api/assets`;
      const method = editingAsset ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Error al guardar el activo');

      toast.success(editingAsset ? "Activo actualizado exitosamente" : "Activo registrado exitosamente");
      onSuccess();
    } catch (error) {
      console.error('Error saving asset:', error);
      toast.error("Error al guardar el activo");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingAsset ? "Editar Activo" : "Registrar Activo Manual"}</DialogTitle>
          <DialogDescription>
            Completa la información del activo. Todos los campos marcados con * son obligatorios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="type">Tipo *</Label>
              <Select value={formData.type} onValueChange={(value) => handleInputChange('type', value)}>
                <SelectTrigger className={errors.type ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive mt-1">{errors.type}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="district">Distrito *</Label>
              <Input
                id="district"
                value={formData.district}
                onChange={(e) => handleInputChange('district', e.target.value)}
                className={errors.district ? "border-destructive" : ""}
              />
              {errors.district && <p className="text-xs text-destructive mt-1">{errors.district}</p>}
            </div>

            <div>
              <Label htmlFor="condition">Condición *</Label>
              <Select value={formData.condition} onValueChange={(value) => handleInputChange('condition', value)}>
                <SelectTrigger className={errors.condition ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar condición" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.condition && <p className="text-xs text-destructive mt-1">{errors.condition}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lat">Latitud *</Label>
              <Input
                id="lat"
                type="number"
                step="any"
                value={formData.lat}
                onChange={(e) => handleInputChange('lat', e.target.value)}
                className={errors.lat ? "border-destructive" : ""}
              />
              {errors.lat && <p className="text-xs text-destructive mt-1">{errors.lat}</p>}
            </div>

            <div>
              <Label htmlFor="lng">Longitud *</Label>
              <Input
                id="lng"
                type="number"
                step="any"
                value={formData.lng}
                onChange={(e) => handleInputChange('lng', e.target.value)}
                className={errors.lng ? "border-destructive" : ""}
              />
              {errors.lng && <p className="text-xs text-destructive mt-1">{errors.lng}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="monthly_sales">Ventas Mensuales (S/) *</Label>
              <Input
                id="monthly_sales"
                type="number"
                step="any"
                value={formData.monthly_sales}
                onChange={(e) => handleInputChange('monthly_sales', e.target.value)}
                className={errors.monthly_sales ? "border-destructive" : ""}
              />
              {errors.monthly_sales && <p className="text-xs text-destructive mt-1">{errors.monthly_sales}</p>}
            </div>

            <div>
              <Label htmlFor="area_m2">Área (m²)</Label>
              <Input
                id="area_m2"
                type="number"
                step="any"
                value={formData.area_m2}
                onChange={(e) => handleInputChange('area_m2', e.target.value)}
                className={errors.area_m2 ? "border-destructive" : ""}
              />
              {errors.area_m2 && <p className="text-xs text-destructive mt-1">{errors.area_m2}</p>}
            </div>
          </div>

          <div>
            <Label htmlFor="num_employees">Número de Empleados</Label>
            <Input
              id="num_employees"
              type="number"
              value={formData.num_employees}
              onChange={(e) => handleInputChange('num_employees', e.target.value)}
              className={errors.num_employees ? "border-destructive" : ""}
            />
            {errors.num_employees && <p className="text-xs text-destructive mt-1">{errors.num_employees}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : (editingAsset ? "Actualizar" : "Registrar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}