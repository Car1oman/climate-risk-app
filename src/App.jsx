import React, { useEffect, useState } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LoginPage from '@/pages/LoginPage';

import AppLayout from './components/layout/AppLayout';
import ClimateRiskLookup from './pages/ClimateRiskLookup';
import DocumentosClimaticos from './pages/DocumentosClimaticos';
import Dashboard from './pages/Dashboard';
import RiskMap from './pages/RiskMap';
import Assets from './pages/Assets';
import AssetDetail from './pages/AssetDetail';
import Alerts from './pages/Alerts';
import Report from './pages/Report';
import DataManagement from './pages/DataManagement';

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ClimateRiskLookup />} />
<Route path="/documentos" element={<DocumentosClimaticos />} />
<Route path="/dashboard" element={<Dashboard />} />
        <Route path="/map" element={<RiskMap />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/report" element={<Report />} />
        <Route path="/data-management" element={<DataManagement />} />
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
