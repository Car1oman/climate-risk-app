// @ts-nocheck
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { TILE_LAYERS } from "../constants";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:       "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:     "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const DEFAULT_CENTER = [-12.0464, -77.0428];

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(
        parseFloat(e.latlng.lat.toFixed(5)),
        parseFloat(e.latlng.lng.toFixed(5))
      );
    },
  });
  return null;
}

function MapFlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target?.pos) return;
    const [lat, lng] = target.pos;
    if (!isFinite(lat) || !isFinite(lng)) return;
    map.flyTo(target.pos, target.zoom, { animate: true, duration: 1.2 });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapView({ tileLayer, onTileLayerChange, onMapClick, markerPos, flyTarget }) {
  const layer = TILE_LAYERS[tileLayer] ?? TILE_LAYERS.osm;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" />
        Haz clic en el mapa para seleccionar una ubicación
      </p>
      <div className="rounded-xl border border-border shadow-sm relative" style={{ height: "480px" }}>
        <MapContainer
          center={DEFAULT_CENTER} zoom={7}
          style={{ height: "100%", width: "100%", borderRadius: "0.75rem" }}
          className="z-0"
        >
          <TileLayer key={tileLayer} url={layer.url} attribution={layer.attribution} />
          <MapClickHandler onMapClick={onMapClick} />
          <MapFlyTo target={flyTarget} />
          {markerPos && <Marker position={markerPos} />}
        </MapContainer>

        <div className="absolute bottom-3 left-3 z-[1000] flex gap-1 bg-card/90 backdrop-blur-sm rounded-lg border border-border p-1 shadow-md">
          {Object.entries(TILE_LAYERS).map(([key, t]) => (
            <button
              key={key}
              onClick={() => onTileLayerChange(key)}
              className={`text-[10px] px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                tileLayer === key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
