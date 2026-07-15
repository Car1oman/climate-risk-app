import * as React from "react";
import { V2Sidebar } from "./V2Sidebar.jsx";

function useActivePath() {
  const [activePath, setActivePath] = React.useState(
    () => window.location.pathname + window.location.search
  );

  React.useEffect(() => {
    function handleLocationChange() {
      setActivePath(window.location.pathname + window.location.search);
    }
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  return activePath;
}

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

export function V2Layout({ children }) {
  const activePath = useActivePath();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <V2Sidebar
        activePath={activePath}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
