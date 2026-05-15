// Shared domain types for frontend and consumed by server via JSDoc imports.

export interface AssetLocation {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  country?: string;
  region?: string;
}

export interface Asset {
  id: string;
  name: string;
  type?: string;
  location: AssetLocation;
  value?: number;
  currency?: string;
  area?: number;
  owner?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClimateRisk {
  assetId: string;
  hazardType: string;
  hazard: number;
  exposure: number;
  impact: number;
  riskScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence?: number;
  horizon?: '2030' | '2050' | '2100';
  scenario?: 'rcp26' | 'rcp45' | 'rcp85';
  narrative?: string;
  adaptations?: string[];
  computedAt?: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  assetId?: string;
  riskType?: string;
  timestamp: string;
  acknowledged?: boolean;
  source?: string;
}

export interface Document {
  id: string;
  title: string;
  type: string;
  url?: string;
  content?: string;
  summary?: string;
  uploadedAt: string;
  source?: string;
  tags?: string[];
  assetIds?: string[];
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

export interface PaginatedResponse<T = unknown> extends APIResponse<T[]> {
  total?: number;
  page?: number;
  pageSize?: number;
}
