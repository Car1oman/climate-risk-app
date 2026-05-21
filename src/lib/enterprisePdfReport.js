import {
  ANALYSIS_LIMITATIONS,
  DATA_SOURCES,
  RESPONSIBLE_INSTITUTIONS,
  SSP_SCENARIOS,
} from "@/lib/methodologyConfig";
import { jsPDF } from "jspdf";

const SCIENTIFIC_REFERENCES = [
  { name: "IPCC AR6", detail: "Sixth Assessment Report. DOI WGI: 10.1017/9781009157896." },
  { name: "CMIP6", detail: "Eyring et al. (2016), GMD. DOI: 10.5194/gmd-9-1937-2016." },
  { name: "WRI Aqueduct", detail: "Aqueduct 4.0 technical note. DOI: 10.46830/writn.23.00061." },
  { name: "World Bank Open Data", detail: "Indicators API and World Development Indicators." },
  { name: "NOAA ENSO", detail: "Climate Prediction Center ENSO/ONI operational monitoring." },
  { name: "Open-Meteo", detail: "Climate API with CMIP6/HighResMIP attribution." },
  { name: "GRI / GIRI", detail: "Global infrastructure risk and resilience screening." },
];

const INSTITUTION_BADGES = ["IPCC", "CMIP6", "World Bank", "GRI", "NOAA", "Open-Meteo"];
const RISK_LABELS = { critico: "Critico", alto: "Alto", medio: "Medio", bajo: "Bajo" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtNumber(value, decimals = 0) {
  const n = Number(value ?? 0);
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function riskBadgeClass(level) {
  if (level === "critico") return "critical";
  if (level === "alto") return "high";
  if (level === "medio") return "medium";
  return "low";
}

function computePortfolio(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const totalAssets = list.length;
  const georeferenced = list.filter((asset) => asset.lat && asset.lng).length;
  const districts = new Set(list.map((asset) => asset.district).filter(Boolean)).size;
  const signalCount = list.filter((asset) => asset.top_risk || asset.risk_level).length;
  const topRisks = [...list]
    .sort((a, b) => String(a.district || "").localeCompare(String(b.district || "")))
    .slice(0, 8);

  return { totalAssets, georeferenced, districts, signalCount, topRisks };
}

function markdownToHtml(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  return lines.map((line) => {
    if (!line.trim()) return "<br />";
    if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith("- ")) return `<p class="bullet">• ${escapeHtml(line.slice(2))}</p>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join("");
}

function renderTopRiskRows(topRisks) {
  if (!topRisks.length) {
    return `<tr><td colspan="6">No hay activos disponibles para priorizacion.</td></tr>`;
  }

  return topRisks.map((asset, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(asset.name || "Activo sin nombre")}</strong><br /><span>${escapeHtml(asset.district || "Sin distrito")}</span></td>
      <td>${escapeHtml(asset.top_risk || "No especificado")}</td>
      <td><span class="risk ${riskBadgeClass(asset.risk_level)}">${escapeHtml(RISK_LABELS[asset.risk_level] || asset.risk_level || "Bajo")}</span></td>
      <td>CMIP6 / GRI</td>
      <td>SSP245 / SSP585</td>
    </tr>
  `).join("");
}

function renderSources() {
  const ids = ["climate_cells", "gri", "open_meteo", "world_bank", "enso", "terrain"];
  return ids.map((id) => {
    const source = DATA_SOURCES[id];
    if (!source) return "";
    return `
      <div class="source-card">
        <div class="source-head">
          <strong>${escapeHtml(source.label)}</strong>
          <span>${escapeHtml(source.confidence || "Confianza documentada")}</span>
        </div>
        <p>${escapeHtml(source.description)}</p>
        <small>${escapeHtml(source.institution)}</small>
      </div>
    `;
  }).join("");
}

function renderScenarioCards() {
  return Object.values(SSP_SCENARIOS).map((scenario) => `
    <div class="scenario">
      <h3>${escapeHtml(scenario.code)} - ${escapeHtml(scenario.name)}</h3>
      <p>${escapeHtml(scenario.description)}</p>
      <dl>
        <dt>Forzamiento</dt><dd>${escapeHtml(scenario.forcing)}</dd>
        <dt>Temperatura 2100</dt><dd>${escapeHtml(scenario.temp_range)}</dd>
        <dt>CO2 2100</dt><dd>${escapeHtml(scenario.co2_2100)}</dd>
      </dl>
    </div>
  `).join("");
}

function renderMethodologyList(formula) {
  return formula.components.map((component) => `
    <li><strong>${escapeHtml(component.label)} (${escapeHtml(component.weight)}):</strong> ${escapeHtml(component.description)}</li>
  `).join("");
}

function renderReferences() {
  return SCIENTIFIC_REFERENCES.map((ref) => `
    <li><strong>${escapeHtml(ref.name)}:</strong> ${escapeHtml(ref.detail)}</li>
  `).join("");
}

function renderLimitations() {
  return ANALYSIS_LIMITATIONS.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderInstitutionNames() {
  return INSTITUTION_BADGES.map((name) => `<span class="institution">${escapeHtml(name)}</span>`).join("");
}

export function buildEnterprisePdfHtml({ assets, generatedReport }) {
  const portfolio = computePortfolio(assets);
  const generatedAt = new Date().toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte Ejecutivo Climatico Enterprise</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #18181b; margin: 0; line-height: 1.45; }
    .page { max-width: 980px; margin: 0 auto; }
    .cover { border-bottom: 3px solid #0f766e; padding-bottom: 18px; margin-bottom: 22px; }
    .eyebrow { color: #0f766e; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { font-size: 28px; margin: 8px 0 6px; }
    h2 { font-size: 17px; margin: 22px 0 9px; color: #0f172a; break-after: avoid; }
    h3 { font-size: 13px; margin: 0 0 6px; color: #334155; }
    p, li, td, th, dd, dt { font-size: 11px; }
    small { color: #71717a; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .institution, .chip { display: inline-block; border: 1px solid #cbd5e1; border-radius: 999px; padding: 3px 8px; font-size: 10px; font-weight: 700; background: #f8fafc; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
    .metric { border: 1px solid #d4d4d8; border-radius: 8px; padding: 10px; background: #fafafa; }
    .metric span { display: block; font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: .04em; }
    .metric strong { display: block; font-size: 18px; margin-top: 4px; }
    .callout { border-left: 4px solid #0f766e; background: #f0fdfa; padding: 11px 13px; margin: 12px 0; }
    .warning { border-left-color: #d97706; background: #fffbeb; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; background: #f1f5f9; color: #334155; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    th, td { border: 1px solid #e4e4e7; padding: 7px; vertical-align: top; }
    td span { color: #71717a; }
    .risk { border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 700; }
    .critical { background: #fee2e2; color: #991b1b; }
    .high { background: #ffedd5; color: #9a3412; }
    .medium { background: #fef3c7; color: #92400e; }
    .low { background: #dcfce7; color: #166534; }
    .sources { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
    .source-card, .scenario { border: 1px solid #e4e4e7; border-radius: 8px; padding: 9px; background: #fff; break-inside: avoid; }
    .source-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .source-head span { font-size: 9px; color: #166534; font-weight: 700; }
    .scenario dl { display: grid; grid-template-columns: 90px 1fr; gap: 3px 8px; margin: 8px 0 0; }
    .scenario dt { color: #71717a; font-weight: 700; }
    .section { break-inside: avoid; }
    .generated-report { border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px; background: #fafafa; }
    .generated-report p { margin: 4px 0; }
    .bullet { margin-left: 8px; }
    footer { margin-top: 24px; border-top: 1px solid #e4e4e7; padding-top: 8px; font-size: 9px; color: #71717a; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page-break { break-before: page; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="cover">
      <div class="eyebrow">Reporte climatico ejecutivo enterprise</div>
      <h1>Evaluacion de riesgo climatico del portafolio</h1>
      <p>Generado el ${escapeHtml(generatedAt)}. Documento exportable para revision ejecutiva, comites de riesgo, sostenibilidad y continuidad operativa.</p>
      <div class="meta">${renderInstitutionNames()}</div>
    </section>

    <section class="section">
      <h2>Resumen ejecutivo</h2>
      <div class="metrics">
        <div class="metric"><span>Activos evaluados</span><strong>${portfolio.totalAssets}</strong></div>
        <div class="metric"><span>Georreferenciados</span><strong>${portfolio.georeferenced}</strong></div>
        <div class="metric"><span>Distritos</span><strong>${portfolio.districts}</strong></div>
        <div class="metric"><span>Senales</span><strong>${portfolio.signalCount}</strong></div>
      </div>
      <div class="callout">
        El portafolio se interpreta mediante evidencia fisica: senales climaticas, exposicion territorial, fuente, periodo, escenario SSP y nivel de confianza.
      </div>
    </section>

    <section class="section">
      <h2>Como interpretar este reporte</h2>
      <p>Los resultados son estimaciones probabilisticas y escenarios de decision. No son predicciones exactas para una fecha especifica ni sustituyen estudios hidrologicos, geotecnicos o de ingenieria de detalle.</p>
      <p>La lectura descriptiva debe usarse para orientar revision tecnica local, planes de continuidad y medidas de adaptacion verificables.</p>
    </section>

    <section class="section">
      <h2>Riesgos priorizados</h2>
      <table>
        <thead>
          <tr><th>#</th><th>Activo</th><th>Senal observada</th><th>Estado</th><th>Fuente</th><th>Escenario</th></tr>
        </thead>
        <tbody>${renderTopRiskRows(portfolio.topRisks)}</tbody>
      </table>
    </section>

    <section class="section">
      <h2>Escenarios SSP</h2>
      <div class="sources">${renderScenarioCards()}</div>
    </section>

    <section class="section page-break">
      <h2>Fuentes y modelos utilizados</h2>
      <div class="sources">${renderSources()}</div>
    </section>

    <section class="section">
      <h2>Metodologia</h2>
      <p><strong>Lectura climatica descriptiva:</strong> senales observadas, fuente cientifica, periodo de referencia, escenario SSP, horizonte temporal, confianza y trazabilidad.</p>
      <ul>
        <li><strong>Fuente:</strong> CMIP6, IPCC AR6, GRI, WRI Aqueduct, World Bank y Open-Meteo.</li>
        <li><strong>Periodo:</strong> historico 1980-2014 y proyecciones 2020-2059.</li>
        <li><strong>Escenarios:</strong> SSP245 y SSP585 para comparar trayectorias plausibles.</li>
      </ul>
    </section>

    <section class="section">
      <h2>Nivel de confianza</h2>
      <p>La confianza del reporte es alta para fuentes institucionales y moderada para inferencias territoriales que requieren validacion tecnica local.</p>
      <p>La trazabilidad tecnica se documenta por fuente, modelo y umbral; cuando una fuente opera como fallback, debe interpretarse como screening y no como veredicto local definitivo.</p>
    </section>

    <section class="section warning callout">
      <h2>Limitaciones metodologicas</h2>
      <ul>${renderLimitations()}</ul>
    </section>

    <section class="section">
      <h2>Bibliografia cientifica</h2>
      <ul>${renderReferences()}</ul>
    </section>

    ${generatedReport ? `
      <section class="section page-break">
        <h2>Reporte narrativo generado</h2>
        <div class="generated-report">${markdownToHtml(generatedReport)}</div>
      </section>
    ` : ""}

    <footer>
      Reporte generado por el sistema de riesgo climatico. Uso recomendado: screening ejecutivo, priorizacion y trazabilidad metodologica. No usar como unico insumo para diseno estructural o decisiones regulatorias sin validacion local.
    </footer>
  </main>
</body>
</html>`;
}

export function exportEnterprisePdf({ assets, generatedReport }) {
  const portfolio = computePortfolio(assets);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  const ensureSpace = (needed = 16) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addText = (text, { size = 9, style = "normal", color = [39, 39, 42], gap = 4 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(.../** @type {[number, number, number]} */ (color));
    const lines = doc.splitTextToSize(String(text ?? ""), contentWidth);
    ensureSpace(lines.length * (size * 0.42) + gap);
    doc.text(lines, margin, y);
    y += (lines.length * (size * 0.42)) + gap;
  };

  const addHeading = (text) => {
    ensureSpace(14);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 118, 110);
    doc.text(text, margin, y);
    y += 7;
  };

  const addDivider = () => {
    ensureSpace(6);
    doc.setDrawColor(212, 212, 216);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  const addMetric = (label, value, x, width) => {
    doc.setDrawColor(212, 212, 216);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, y, width, 20, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text(label.toUpperCase(), x + 3, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text(String(value), x + 3, y + 15);
  };

  const addBullets = (items, maxItems = items.length) => {
    items.slice(0, maxItems).forEach((item) => {
      const text = typeof item === "string" ? item : `${item.label}: ${item.description}`;
      addText(`• ${text}`, { size: 8, gap: 2 });
    });
  };

  const generatedAt = new Date().toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 13, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("REPORTE CLIMATICO EJECUTIVO ENTERPRISE", margin, 8);

  y = 24;
  doc.setTextColor(24, 24, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text("Evaluacion de riesgo climatico del portafolio", margin, y);
  y += 8;
  addText(`Generado el ${generatedAt}. Documento para revision ejecutiva, comites de riesgo, sostenibilidad y continuidad operativa.`, { size: 9 });
  addText(`Instituciones y modelos referenciales: ${INSTITUTION_BADGES.join(" | ")}`, { size: 8, style: "bold", color: [15, 118, 110] });

  addHeading("Resumen ejecutivo");
  const metricGap = 4;
  const metricWidth = (contentWidth - (metricGap * 3)) / 4;
  ensureSpace(25);
  addMetric("Activos", portfolio.totalAssets, margin, metricWidth);
  addMetric("Georreferenciados", portfolio.georeferenced, margin + metricWidth + metricGap, metricWidth);
  addMetric("Distritos", portfolio.districts, margin + (metricWidth + metricGap) * 2, metricWidth);
  addMetric("Senales", portfolio.signalCount, margin + (metricWidth + metricGap) * 3, metricWidth);
  y += 27;
  addText("El portafolio se interpreta mediante evidencia fisica: senales climaticas, exposicion territorial, fuentes, escenarios SSP y confianza.", { size: 9 });

  addHeading("Como interpretar este reporte");
  addBullets([
    "Los resultados son estimaciones probabilisticas y escenarios de decision, no predicciones exactas por fecha.",
    "La lectura descriptiva orienta validacion tecnica, continuidad operativa y adaptacion sin producir un score unico.",
    "Los escenarios SSP comparan trayectorias climaticas plausibles; no expresan probabilidad de ocurrencia.",
  ]);

  addHeading("Riesgos priorizados");
  if (!portfolio.topRisks.length) {
    addText("No hay activos disponibles para priorizacion.", { size: 9 });
  } else {
    portfolio.topRisks.forEach((asset, index) => {
      ensureSpace(16);
      doc.setDrawColor(228, 228, 231);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(24, 24, 27);
      doc.text(`${index + 1}. ${asset.name || "Activo sin nombre"}`, margin + 3, y + 5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(82, 82, 91);
      doc.text(`${asset.district || "Sin distrito"} | ${asset.top_risk || "Riesgo no especificado"}`, margin + 3, y + 10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 118, 110);
      doc.text("CMIP6 / GRI | SSP245 / SSP585", pageWidth - margin - 58, y + 8);
      y += 17;
    });
  }

  addHeading("Escenarios SSP");
  Object.values(SSP_SCENARIOS).forEach((scenario) => {
    addText(`${scenario.code} - ${scenario.name}: ${scenario.description} Forzamiento ${scenario.forcing}; temperatura 2100 ${scenario.temp_range}; CO2 2100 ${scenario.co2_2100}.`, { size: 8 });
  });

  addDivider();
  addHeading("Fuentes y modelos utilizados");
  ["climate_cells", "gri", "open_meteo", "world_bank", "enso", "terrain"].forEach((id) => {
    const source = DATA_SOURCES[id];
    if (!source) return;
    addText(`${source.label} (${source.confidence}): ${source.description} Institucion: ${source.institution}.`, { size: 8 });
  });

  addHeading("Metodologia");
  addText("Metodologia descriptiva: fuente, periodo, escenario SSP, horizonte, confianza y trazabilidad cientifica.", { size: 8, style: "bold" });

  addHeading("Nivel de confianza");
  addText("La confianza es alta para fuentes institucionales y moderada para inferencias de negocio. La trazabilidad tecnica debe revisarse por fuente, modelo, umbral y periodo temporal.", { size: 8 });
  RESPONSIBLE_INSTITUTIONS.forEach((institution) => {
    addText(`${institution.name}: ${institution.role}`, { size: 8, gap: 2 });
  });

  addHeading("Limitaciones metodologicas");
  addBullets(ANALYSIS_LIMITATIONS);

  addHeading("Bibliografia cientifica");
  addBullets(SCIENTIFIC_REFERENCES.map((ref) => `${ref.name}: ${ref.detail}`));

  if (generatedReport) {
    doc.addPage();
    y = margin;
    addHeading("Reporte narrativo generado");
    String(generatedReport).split(/\r?\n/).forEach((line) => {
      if (!line.trim()) {
        y += 2;
      } else {
        addText(line.replace(/^#+\s*/, "").replace(/^-\s*/, "• "), { size: 8, gap: 2 });
      }
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - margin - 24, pageHeight - 8);
    doc.text("Uso recomendado: screening ejecutivo y priorizacion. Validar localmente para diseno o cumplimiento regulatorio.", margin, pageHeight - 8);
  }

  doc.save(`reporte-climatico-enterprise-${new Date().toISOString().slice(0, 10)}.pdf`);
}
