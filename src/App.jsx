import React, { useEffect, useState } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import RiskMap from './pages/RiskMap';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Simulator from './pages/Simulator';
import Alerts from './pages/Alerts';
import Report from './pages/Report';
import AppSettings from './pages/AppSettings';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground">Cargando plataforma...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/map" element={<RiskMap />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/report" element={<Report />} />
        <Route path="/settings" element={<AppSettings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  const [backendMessage, setBackendMessage] = useState(null);
  const [backendError, setBackendError] = useState(null);

  useEffect(() => {
    const pingBackend = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/test');
        const data = await response.json();
        setBackendMessage(data.message);
        console.log('Backend response:', data);
      } catch (error) {
        setBackendError(error.message || 'No se pudo conectar al backend');
        console.error('Backend connection error:', error);
      }
    };

    pingBackend();
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        {backendMessage && (
          <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-border bg-card/95 px-4 py-3 text-sm text-foreground shadow-lg">
            Backend: {backendMessage}
          </div>
        )}
        {backendError && (
          <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-lg">
            Error backend: {backendError}
          </div>
        )}
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App