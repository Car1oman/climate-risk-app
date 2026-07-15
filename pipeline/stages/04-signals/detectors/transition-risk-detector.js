import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_PATH = join(__dirname, "..", "..", "..", "config", "sector-profiles.json");

let profilesCache = null;

function getProfiles() {
  if (profilesCache) return profilesCache;
  if (!existsSync(PROFILES_PATH)) return { sectors: {}, default: {} };
  profilesCache = JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
  return profilesCache;
}

// H-16 (documentacion-v2/stage-04, MEDIO): un sector sin perfil propio en
// sector-profiles.json (nuevo, mal escrito, o — caso real y actualmente
// alcanzable en este proyecto: "infrastructure" está en SUPPORTED_SECTORS
// (pipeline/shared/types.js) y en resolution-profiles.json, pero NO tiene
// entrada en sector-profiles.json.sectors) caía en profiles.default
// silenciosamente. El resultado (transition_risks:[] del perfil default) es
// indistinguible de "este sector fue evaluado y genuinamente no tiene
// riesgos de transición" — un array vacío no lleva esa distinción consigo.
// profile_source la hace explícita y auditable en vez de dejarla implícita.
export function detectTransitionRisks(sector) {
  const profiles = getProfiles();
  const sectorProfile = profiles.sectors?.[sector];
  const profile = sectorProfile || profiles.default;
  const profileSource = sectorProfile ? "sector_specific" : "default";

  // H-15 (documentacion-v2/stage-04): transition_sensitivity es un campo
  // requerido en cada perfil de sector-profiles.json. El fallback ?? 0.5
  // anterior era idéntico al valor del sector "default" (0.5), making it
  // indistinguishable from a deliberate choice — un auditor no podría saber
  // si el 0.5 vino del perfil default o del fallback. Ahora se falla
  // loud si el perfil existe pero no tiene transition_sensitivity, en vez
  // de aplicar un valor arbitrario silenciosamente.
  if (profile && profile.transition_sensitivity == null) {
    const profileName = sectorProfile ? `sector '${sector}'` : "sector 'default' (fallback)";
    throw new Error(
      `transition_sensitivity requerido pero no definido en ${profileName} de sector-profiles.json ` +
      `(H-15: cada perfil debe declarar transition_sensitivity explícitamente, sin fallback arbitrario)`
    );
  }

  const risks = !profile?.transition_risks?.length ? [] : profile.transition_risks.map(risk => ({
    risk_id: `${sector}_${risk.type}`,
    sector,
    type: risk.type,
    description: risk.description,
    timeframe: risk.timeframe,
    severity: risk.severity,
    sensitivity: profile.transition_sensitivity,
    signal_strength: calculateTransitionSignalStrength(risk, profile),
  }));

  return { profile_source: profileSource, risks };
}

// H-06 (documentacion-v2/stage-04, ALTO): severityMap {0.3, 0.5, 0.75, 0.95}
// y la fórmula de ajuste 0.5+sensitivity*0.5 no tenían fuente — reemplazados
// por dos convenciones ya usadas/citadas en este mismo proyecto, en vez de
// una calibración nueva inventada:
//
// 1. severity -> score: baja/media/alta/catastrofica es la MISMA familia de
//    4 palabras que RiskLevelEnum (bajo/medio/alto/catastrofico) usa para
//    risk_level en riesgo físico, y ese riesgo físico ya está anclado a la
//    escala ordinal de IPCC AR6 WGII (2022) Fig.SPM.1 (ver thresholds.json
//    risk_classification._refs). Un auditor que compare severity="alta" en
//    riesgo de transición contra risk_level="alto" en riesgo físico esperaría
//    que ambos representen el mismo rango relativo. Sin una calibración
//    cardinal documentada entre las 4 categorías (misma situación que
//    H-4.1, documentacion-v2/stage-03, enfrentó para los pesos de
//    selection_components), la asignación defendible es espaciado
//    IGUAL a lo largo de [0,1] (rank/4) — la asignación de máxima entropía
//    para una escala ordinal sin más información (Laplace; Jaynes 1957,
//    misma justificación ya usada en adaptive-capacity.json para su default
//    y en Stage03 H-4.1 para pesos iguales), no una curva o huecos elegidos
//    porque "se sienten bien".
// 2. severity x sensitivity: el piso 0.5 anterior significaba que la
//    sensibilidad SOLO podía reducir la severidad a la mitad como máximo, sin
//    poder anularla ni preservarla completa — un límite asimétrico sin
//    explicación. Reemplazado por un producto simple, consistente con el
//    marco de riesgo que ya gobierna todo este pipeline (thresholds.json
//    _methodology.framework: "IPCC AR6 Risk Framework... Riesgo =
//    f(Amenaza, Exposición, Vulnerabilidad, CA)" — la misma estructura
//    multiplicativa amenaza x exposición/vulnerabilidad que Stage06 usa para
//    riesgo físico, (P x I)/CA). severity_base es el proxy de magnitud de
//    la amenaza; transition_sensitivity (sector-profiles.json) es el proxy
//    de exposición/vulnerabilidad del sector a ESTE tipo de riesgo. Con
//    sensitivity=0 (sector genuinamente no expuesto) la señal es
//    honestamente 0, no la mitad de la severidad abstracta; con
//    sensitivity=1 (exposición máxima) la señal iguala la severidad
//    completa, sin techo arbitrario por debajo.
const SEVERITY_RANK = { baja: 1, media: 2, alta: 3, catastrofica: 4 };
const SEVERITY_RANK_COUNT = 4;

function severityToScore(severity) {
  const rank = SEVERITY_RANK[severity];
  if (rank == null) {
    throw new Error(
      `severity desconocida '${severity}' en sector-profiles.json transition_risks — valores válidos: ${Object.keys(SEVERITY_RANK).join(", ")}`
    );
  }
  return rank / SEVERITY_RANK_COUNT;
}

function calculateTransitionSignalStrength(risk, profile) {
  const base = severityToScore(risk.severity);
  // H-15: transition_sensitivity ya está validado en detectTransitionRisks()
  // como requerido — no se necesita fallback aquí. Si llega undefined,
  // es un bug en el caller, no un caso edge a cubrir silenciosamente.
  const sensitivity = profile.transition_sensitivity;
  const adjusted = base * sensitivity;
  return Math.round(Math.min(1, adjusted) * 100) / 100;
}
