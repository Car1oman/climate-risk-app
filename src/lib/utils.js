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

export function getRiskColor(level) {
  const colors = {
    critico: {
      bg: "bg-red-500/10",
      text: "text-red-500",
      border: "border-red-500/30",
      dot: "bg-red-500",
      color: "text-red-500",
    },
    alto: {
      bg: "bg-orange-500/10",
      text: "text-orange-500",
      border: "border-orange-500/30",
      dot: "bg-orange-500",
      color: "text-orange-500",
    },
    medio: {
      bg: "bg-amber-500/10",
      text: "text-amber-500",
      border: "border-amber-500/30",
      dot: "bg-amber-500",
      color: "text-amber-500",
    },
    bajo: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-500",
      border: "border-emerald-500/30",
      dot: "bg-emerald-500",
      color: "text-emerald-500",
    },
  };

  return colors[level] || colors.bajo;
}


export const isIframe = window.self !== window.top;
    
