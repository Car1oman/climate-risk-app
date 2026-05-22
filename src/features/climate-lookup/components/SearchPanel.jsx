// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import { API_URL } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MapPin, Building2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function SearchPanel({ onLocationSelect }) {
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState([]);
  const [searching, setSearching]     = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [registerForm, setRegisterForm]   = useState({ name: "", unidad_negocio: "" });
  const [registering, setRegistering]     = useState(false);
  const debounceRef = useRef(null);
  const panelRef    = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) { setResults(await res.json()); setShowResults(true); }
      } catch (e) { console.error("Search error:", e); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectResult = (r) => {
    onLocationSelect(r.lat, r.lng);
    setQuery(r.tipo === "asset" ? r.name : r.direccion);
    setShowResults(false);
    setSelectedPlace(r.tipo === "place" ? r : null);
    setRegisterForm({ name: "", unidad_negocio: "" });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.name.trim()) { toast.error("El nombre del activo es requerido"); return; }
    setRegistering(true);
    try {
      const res = await fetch(`${API_URL}/api/places/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: selectedPlace.id,
          name: registerForm.name,
          unidad_negocio: registerForm.unidad_negocio,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      toast.success("Activo registrado correctamente");
      setRegisterForm({ name: "", unidad_negocio: "" });
      setSelectedPlace(null);
      const fresh = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`);
      if (fresh.ok) { setResults(await fresh.json()); setShowResults(true); }
    } catch (err) {
      toast.error(err.message || "Error al registrar el activo");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3" ref={panelRef}>
      <div className="relative">
        <Label className="text-xs text-muted-foreground">Buscar por nombre o dirección</Label>
        <div className="relative mt-1.5">
          {searching
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            : <Search  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />}
          <Input
            className="pl-9"
            placeholder="Ej. Plaza Vea San Isidro o Av. Javier Prado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
        </div>

        {showResults && (
          <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {results.length === 0 && !searching && (
              <p className="px-3 py-2.5 text-xs text-muted-foreground text-center">
                Sin resultados para &ldquo;{query}&rdquo;
              </p>
            )}
            {results.map((r, i) => (
              <button
                key={r.id || i}
                onClick={() => handleSelectResult(r)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0"
              >
                <span className="flex-shrink-0 mt-0.5">
                  {r.tipo === "asset"
                    ? <Building2 className="w-4 h-4 text-blue-500" />
                    : <MapPin    className="w-4 h-4 text-amber-500" />}
                </span>
                <div className="flex-1 min-w-0">
                  {r.tipo === "asset" ? (
                    <>
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.direccion}</p>
                      {r.unidad_negocio && (
                        <Badge className="text-[10px] px-1.5 py-0 mt-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 border-0">
                          {r.unidad_negocio}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">{r.direccion}</p>
                      <Badge className="text-[10px] px-1.5 py-0 mt-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200 border-0">
                        Sin activos registrados
                      </Badge>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPlace && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">No hay activos registrados aquí</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-snug">{selectedPlace.direccion}</p>
            </div>
          </div>
          <form onSubmit={handleRegister} className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre del activo *</Label>
              <Input
                placeholder="Ej. Plaza Vea San Isidro"
                value={registerForm.name}
                onChange={(e) => setRegisterForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm text-foreground bg-secondary"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unidad de negocio</Label>
              <Input
                placeholder="Ej. Supermercados"
                value={registerForm.unidad_negocio}
                onChange={(e) => setRegisterForm(f => ({ ...f, unidad_negocio: e.target.value }))}
                className="h-8 text-sm text-foreground bg-secondary"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1 h-8 text-xs gap-1.5" disabled={registering}>
                {registering
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Registrando...</>
                  : <><Plus    className="w-3.5 h-3.5" />Registrar activo</>}
              </Button>
              <Button
                type="button" size="sm" variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => setSelectedPlace(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
