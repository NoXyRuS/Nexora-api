// ============================================================================
// Diagnóstico por Reglas Deterministas (Sin IA)
// ============================================================================

import {
  NormalizedProfile,
  DiagnosticLabel,
  Severity,
} from "../types/index.js";

/**
 * Genera el diagnóstico empresarial automático por reglas duras.
 * Principio: Determinista, sin IA, mismo perfil produce exactamente las mismas etiquetas.
 */
export function runRuleBasedDiagnosis(profile: NormalizedProfile): DiagnosticLabel[] {
  const labels: DiagnosticLabel[] = [];
  const d = profile.derivatives;

  // 1. Capacidad limitada: utilización > 0.85
  if (d.utilizacion > 0.85) {
    const severity: Severity = d.utilizacion > 0.95 ? "alta" : "media";
    labels.push({
      code: "capacidad_limitada",
      severity,
      message: `Utilización del ${(d.utilizacion * 100).toFixed(1)}% cerca o sobre el límite operativo`,
      metricValue: Number((d.utilizacion * 100).toFixed(1)),
    });
  }

  // 2. Capacidad ociosa: utilización < 0.5
  if (d.utilizacion < 0.5) {
    const severity: Severity = d.utilizacion < 0.35 ? "alta" : "media";
    labels.push({
      code: "capacidad_ociosa",
      severity,
      message: `Subutilización de capacidad instalada (${(d.utilizacion * 100).toFixed(1)}%)`,
      metricValue: Number((d.utilizacion * 100).toFixed(1)),
    });
  }

  // 3. Margen bajo: margen < 10%
  if (d.margenPct < 10) {
    const severity: Severity = d.margenPct <= 0 ? "alta" : "media";
    labels.push({
      code: "margen_bajo",
      severity,
      message:
        d.margenPct <= 0
          ? `Operación en pérdidas con margen del ${d.margenPct.toFixed(1)}%`
          : `Margen de ganancia estrecho (${d.margenPct.toFixed(1)}%) vulnerable a fluctuaciones`,
      metricValue: d.margenPct,
    });
  }

  // 4. Demanda en caída: tendencia < -5%
  if (d.tendenciaMensualPct < -5) {
    const severity: Severity = d.tendenciaMensualPct <= -15 ? "alta" : "media";
    labels.push({
      code: "demanda_en_caida",
      severity,
      message: `Tendencia de ventas en contracción (${d.tendenciaMensualPct}%) en los últimos 3 meses`,
      metricValue: d.tendenciaMensualPct,
    });
  }

  // 5. Liquidez crítica: runway < 3 meses
  if (d.runwayMeses !== null && d.runwayMeses < 3) {
    const severity: Severity = d.runwayMeses < 1.5 ? "alta" : "media";
    labels.push({
      code: "liquidez_critica",
      severity,
      message: `Caja disponible suficiente solo para ${d.runwayMeses.toFixed(1)} meses de pérdida`,
      metricValue: d.runwayMeses,
    });
  }

  // 6. Marketing pesado: marketing > 15% de ingresos
  const marketingPct =
    d.ingresos > 0 ? (profile.marketingMensual / d.ingresos) * 100 : 0;
  if (marketingPct > 15) {
    const severity: Severity = marketingPct > 25 ? "alta" : "media";
    labels.push({
      code: "marketing_pesado",
      severity,
      message: `El gasto en marketing representa el ${marketingPct.toFixed(1)}% de los ingresos`,
      metricValue: Number(marketingPct.toFixed(1)),
    });
  }

  // 7. Servicio débil: satisfacción < 65/100
  if (profile.satisfaccionBase < 65) {
    const severity: Severity = profile.satisfaccionBase < 50 ? "alta" : "media";
    labels.push({
      code: "servicio_debil",
      severity,
      message: `Nivel de satisfacción de clientes bajo (${profile.satisfaccionBase}/100)`,
      metricValue: profile.satisfaccionBase,
    });
  }

  // 8. Presión competitiva: competencia alta
  if (profile.nivelCompetencia === "alta") {
    labels.push({
      code: "presion_competitiva",
      severity: "alta",
      message: "Entorno con alta rivalidad comercial y guerra de precios potencial",
      metricValue: profile.nivelCompetencia,
    });
  }

  return labels;
}
