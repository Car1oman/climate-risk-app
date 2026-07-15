import * as React from "react";
import { V2Layout } from "./components/layout/V2Layout.jsx";
import { V2Home } from "./pages/V2Home.jsx";
import { V2Comparison } from "./pages/V2Comparison.jsx";

const ROUTES = {
  "/v2/": { title: "Análisis de Riesgo", render: () => <V2Home /> },
  "/v2/comparison": { title: "Comparación v1 vs v2", render: () => <V2Comparison /> },
};

function RouteNotFound() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">Ruta no encontrada</h2>
        <p className="text-sm text-muted-foreground mb-4">
          La página que buscas no existe en la v2.
        </p>
        <a
          href="/v2/"
          className="text-sm text-primary hover:underline"
        >
          ← Volver al inicio
        </a>
      </div>
    </div>
  );
}

function getRoute(path) {
  for (const [pattern, route] of Object.entries(ROUTES)) {
    if (path === pattern) return route;
  }
  return null;
}

export default function App() {
  const [path, setPath] = React.useState(
    () => window.location.pathname
  );

  React.useEffect(() => {
    function handleLocationChange() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  const route = getRoute(path);

  return (
    <V2Layout>
      {route ? route.render() : <RouteNotFound />}
    </V2Layout>
  );
}
