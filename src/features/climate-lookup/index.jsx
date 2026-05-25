// Active narrative UI (Sprint 16)
export { default as ExecutiveSummaryCard }    from "./components/ExecutiveSummaryCard";
export { default as ConsolidatedRiskCard }    from "./components/ConsolidatedRiskCard";
export { default as RiskPeriodSection }       from "./components/RiskPeriodSection";
export { default as ScientificFooter }        from "./components/ScientificFooter";

// Infrastructure
export { default as MapView }                 from "./components/MapView";
export { default as SearchPanel }             from "./components/SearchPanel";
export { default as AnalysisLoading }         from "./components/AnalysisLoading";
export { default as AdaptationPanel }         from "./components/AdaptationPanel";
export { default as TerritorialContextPanel } from "./components/TerritorialContextPanel";
export { default as AIPanel }                 from "./components/AIPanel";
export { TraceBadges, TraceabilityDetails }   from "./components/TraceabilityWidgets";

// Deprecated panels — kept for backward-compat; not imported by any active page
// export { default as NarrativePanel }   from "./components/NarrativePanel";
// export { default as SignalsPanel }     from "./components/SignalsPanel";
// export { default as RisksPanel }       from "./components/RisksPanel";
// export { default as GRIThreatsPanel }  from "./components/GRIThreatsPanel";

export * from "./constants";
export * from "./utils";
