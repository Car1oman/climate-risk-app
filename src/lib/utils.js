import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 

export function formatCurrency(value, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}


export const isIframe = window.self !== window.top;

export function getRiskColor(riskLevel) {
  switch (riskLevel) {
    case 'critico':
      return { color: 'text-red-400', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'alto':
      return { color: 'text-orange-400', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' };
    case 'medio':
      return { color: 'text-yellow-400', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' };
    case 'bajo':
      return { color: 'text-green-400', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' };
    default:
      return { color: 'text-muted-foreground', bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  }
}
    
