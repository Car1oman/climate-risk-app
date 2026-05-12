// TODO: Replace with a live backend endpoint (e.g. GET /api/alerts) that reads
// from the DB. This static array is a placeholder — it does not reflect real
// alert state and will diverge from production data over time.
export const alerts = [
  {
    id: "a1",
    title: "Alerta de inundación leve",
    is_active: true,
    created_date: "2026-03-31",
    severity: "medio"
  },
  {
    id: "a2",
    title: "Monitoreo de El Niño activado",
    is_active: true,
    created_date: "2026-03-25",
    severity: "alto"
  },
  {
    id: "a3",
    title: "Inspección de infraestructura programada",
    is_active: false,
    created_date: "2026-03-20",
    severity: "bajo"
  }
];