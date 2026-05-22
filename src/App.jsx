import React, { useEffect, useState } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LoginPage from '@/pages/LoginPage';

import AppLayout from './components/layout/AppLayout';
import AppSettings from './pages/AppSettings';
import ClimateDataUpload from './pages/ClimateDataUpload';
import ClimateRiskLookup from './pages/ClimateRiskLookup';
import DocumentosClimaticos from './pages/DocumentosClimaticos';

// Rutas MVP activas. Dashboard, RiskMap, Assets, AssetDetail, Alerts, Report,
// DataManagement están desactivadas del flujo principal (versión 2).

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ClimateRiskLookup />} />
        <Route path="/climate-upload" element={<ClimateDataUpload />} />
        <Route path="/documentos" element={<DocumentosClimaticos />} />
        <Route path="/settings" element={<AppSettings />} />
        {/* Rutas desactivadas — redirigen al flujo principal hasta versión 2 */}
        <Route path="/dashboard"        element={<Navigate to="/" replace />} />
        <Route path="/map"              element={<Navigate to="/" replace />} />
        <Route path="/assets"           element={<Navigate to="/" replace />} />
        <Route path="/assets/:id"       element={<Navigate to="/" replace />} />
        <Route path="/alerts"           element={<Navigate to="/" replace />} />
        <Route path="/report"           element={<Navigate to="/" replace />} />
        <Route path="/data-management"  element={<Navigate to="/" replace />} />
        <Route path="/climate-risk-lookup" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const AppGate = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <AuthenticatedApp />;
};

function App() {
  const [backendMessage, setBackendMessage] = useState(null);
  const [backendError, setBackendError] = useState(null);

  useEffect(() => {
    const pingBackend = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://climate-risk-app-91ev.onrender.com';
        const response = await fetch(`${apiUrl}/api/test`);
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

  useEffect(() => {
    if (!backendMessage) return;
    const t = setTimeout(() => setBackendMessage(null), 5000);
    return () => clearTimeout(t);
  }, [backendMessage]);

  useEffect(() => {
    if (!backendError) return;
    const t = setTimeout(() => setBackendError(null), 5000);
    return () => clearTimeout(t);
  }, [backendError]);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AppGate />
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
