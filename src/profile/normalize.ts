// ============================================================================
// Normalización de Perfil y Cálculo de Derivados (Sin IA)
// ============================================================================

import {
  CaseFormInput,
  NormalizedProfile,
  ProfileDerivatives,
  Assumption,
} from "../types/index.js";

/**
 * Convierte una escala de 1 a 5 a escala porcentual estándar 0 a 100.
 */
export function scale1To5To100(val: number): number {
  const clamped = Math.max(1, Math.min(5, val));
  return Math.round((clamped / 5) * 100);
}

/**
 * Calcula los derivados financieros y operativos a partir del perfil.
 * Principio: El motor calcula; nunca se inventan o aproximan manualmente.
 */
export function calculateDerivatives(
  clientes: number,
  ticket: number,
  costoVariablePct: number,
  costosFijos: number,
  marketing: number,
  deuda: number,
  capacidad: number,
  caja: number,
  tendenciaTipo: "cayendo" | "estable" | "creciendo",
  tendenciaPct: number
): ProfileDerivatives {
  const ingresos = clientes * ticket;
  const costosVariables = ingresos * (costoVariablePct / 100);
  const costosTotales = costosVariables + costosFijos + marketing + deuda;
  const beneficioMensual = ingresos - costosTotales;
  const margenPct = ingresos > 0 ? (beneficioMensual / ingresos) * 100 : 0;
  const utilizacion = capacidad > 0 ? clientes / capacidad : 1;

  // Punto de equilibrio en unidades de clientes:
  // (Fijos + Marketing + Deuda) / (Ticket * (1 - CostoVariable%))
  const margenContribucionUnitario = ticket * (1 - costoVariablePct / 100);
  const costosFijosTotales = costosFijos + marketing + deuda;
  const puntoEquilibrioClientes =
    margenContribucionUnitario > 0
      ? costosFijosTotales / margenContribucionUnitario
      : 0;

  // Runway: solo si hay pérdida mensual
  let runwayMeses: number | null = null;
  if (beneficioMensual < 0) {
    const perdidaMensual = Math.abs(beneficioMensual);
    runwayMeses = perdidaMensual > 0 ? caja / perdidaMensual : 0;
  }

  // Tendencia mensual efectiva estimada
  const tendenciaMensualPct =
    tendenciaTipo === "cayendo"
      ? -Math.abs(tendenciaPct)
      : tendenciaTipo === "creciendo"
      ? Math.abs(tendenciaPct)
      : 0;

  return {
    ingresos: Number(ingresos.toFixed(2)),
    costosVariables: Number(costosVariables.toFixed(2)),
    costosTotales: Number(costosTotales.toFixed(2)),
    beneficioMensual: Number(beneficioMensual.toFixed(2)),
    margenPct: Number(margenPct.toFixed(2)),
    utilizacion: Number(utilizacion.toFixed(4)),
    puntoEquilibrioClientes: Number(puntoEquilibrioClientes.toFixed(2)),
    runwayMeses:
      runwayMeses !== null ? Number(runwayMeses.toFixed(2)) : null,
    tendenciaMensualPct,
  };
}

/**
 * Normaliza el formulario del caso, aplicando valores por defecto y
 * calculando los derivados deterministas.
 */
export function normalizeProfile(
  raw: CaseFormInput,
  assumptions: Assumption[]
): NormalizedProfile {
  const estacionalidad = raw.estacionalidad ?? "ninguna";
  const cuotasDeudaMensuales = raw.cuotasDeudaMensuales ?? 0;
  const desgloseCostosFijos = raw.desgloseCostosFijos ?? {};
  const descripcionLibre = raw.descripcionLibre?.trim() ?? "";
  const restricciones = raw.restricciones ?? [];

  // Satisfacción y reputación por defecto: 3.5 sobre 5 (70 / 100)
  const satisfaccionBase =
    raw.satisfaccionClientes !== undefined
      ? scale1To5To100(raw.satisfaccionClientes)
      : 70;

  const reputacionBase =
    raw.reputacion !== undefined ? scale1To5To100(raw.reputacion) : 70;

  const derivatives = calculateDerivatives(
    raw.clientesPorMes,
    raw.ticketPromedio,
    raw.costoVariablePct,
    raw.costosFijosMensuales,
    raw.marketingMensual,
    cuotasDeudaMensuales,
    raw.capacidadMaximaMes,
    raw.cajaDisponible,
    raw.tendenciaUltimos3Meses.tipo,
    raw.tendenciaUltimos3Meses.porcentaje
  );

  return {
    raw,
    rubro: raw.rubro,
    tipoOferta: raw.tipoOferta,
    moneda: raw.moneda,
    descripcionLibre,
    clientesPorMes: raw.clientesPorMes,
    ticketPromedio: raw.ticketPromedio,
    tendenciaUltimos3Meses: raw.tendenciaUltimos3Meses,
    estacionalidad,
    costoVariablePct: raw.costoVariablePct,
    costosFijosMensuales: raw.costosFijosMensuales,
    desgloseCostosFijos,
    marketingMensual: raw.marketingMensual,
    cuotasDeudaMensuales,
    capacidadMaximaMes: raw.capacidadMaximaMes,
    numeroEmpleados: raw.numeroEmpleados,
    nivelCompetencia: raw.nivelCompetencia,
    cajaDisponible: raw.cajaDisponible,
    satisfaccionBase,
    reputacionBase,
    problemaPrincipal: raw.problemaPrincipal,
    objetivoPrioritario: raw.objetivoPrioritario,
    restricciones,
    horizonte: raw.horizonte,
    derivatives,
    assumptions,
    isConfirmed: false,
  };
}
