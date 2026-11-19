// ============================================================================
// Motor de Simulación Determinista Mensual y Bandas de Incertidumbre
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  SimulationMonthState,
  SimulationRun,
  SimulationResult,
  TriggeredEvent,
  NivelCompetencia,
} from "../types/index.js";
import { evaluateSecondOrderEvents } from "./events.js";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Retorna la elasticidad precio de la demanda según el nivel de competencia.
 */
export function getElasticityByCompetition(nivel: NivelCompetencia): number {
  switch (nivel) {
    case "baja":
      return 0.8;
    case "media":
      return 1.3;
    case "alta":
      return 1.8;
  }
}

/**
 * Calcula el factor multiplicador de estacionalidad para el mes t (1 a 24).
 */
export function getSeasonalityFactor(
  estacionalidad: "ninguna" | "leve" | "fuerte",
  t: number
): number {
  if (estacionalidad === "ninguna") return 1.0;
  const amplitud = estacionalidad === "leve" ? 0.05 : 0.15;
  // Ciclo sinusoidal determinista anual
  return 1.0 + amplitud * Math.sin((2 * Math.PI * (t - 1)) / 12);
}

/**
 * Calcula el incremento de demanda (lift) de la decisión en el mes t.
 */
export function calculateDemandLift(
  decision: Decision | undefined,
  t: number,
  horizon: number,
  fatigaActiva: boolean
): number {
  if (!decision || !decision.demandLift) return 0;
  const { start, end, curve, lagMonths } = decision.demandLift;

  if (t <= lagMonths) return 0;

  const activeMonth = t - lagMonths;
  let liftPct = 0;

  if (curve === "pulse") {
    // Pulso de 2 meses
    if (activeMonth === 1 || activeMonth === 2) {
      liftPct = start;
    } else {
      liftPct = 0;
    }
  } else {
    // Interpolación lineal de start a end
    const totalLiftMonths = Math.max(1, horizon - lagMonths);
    const progress = Math.min(1, Math.max(0, (activeMonth - 1) / Math.max(1, totalLiftMonths - 1)));
    liftPct = start + (end - start) * progress;
  }

  // Reducción por evento de fatiga publicitaria
  if (fatigaActiva) {
    liftPct *= 0.7;
  }

  return liftPct / 100;
}

/**
 * Ejecuta una corrida mensual individual (determinista).
 */
export function runSingleSimulation(
  profile: NormalizedProfile,
  decision: Decision | undefined,
  horizon: number,
  runType: "base" | "pesimista" | "optimista" = "base",
  initialStateOverride?: Partial<SimulationMonthState>
): SimulationRun {
  const months: SimulationMonthState[] = [];
  const triggeredEventsAll: TriggeredEvent[] = [];
  const triggeredEventIds = new Set<string>();

  // Contadores para eventos consecutivos
  const stateCounters = {
    consecutiveExcessMonths: 0,
    consecutiveHighUtilMonths: 0,
    marketingDeltaMonths: 0,
  };

  // Ajustes de parámetros según banda de incertidumbre si la confianza de los supuestos es "baja"
  let adjustedDecision: Decision | undefined = decision;
  if (decision && runType !== "base") {
    const hasLowConfidence = decision.assumptions.some(
      (a) => a.confidence === "baja"
    );
    if (hasLowConfidence) {
      const multiplier = runType === "pesimista" ? 0.7 : 1.3;
      const costMultiplier = runType === "pesimista" ? 1.3 : 0.7;
      adjustedDecision = {
        ...decision,
        demandLift: {
          ...decision.demandLift,
          start: decision.demandLift.start * multiplier,
          end: decision.demandLift.end * multiplier,
        },
        satisfactionPerMonth: decision.satisfactionPerMonth * multiplier,
        fixedDelta: decision.fixedDelta * costMultiplier,
        marketingDelta: decision.marketingDelta * costMultiplier,
        oneTimeCost: decision.oneTimeCost * costMultiplier,
      };
    }
  }

  const baseElasticidad = getElasticityByCompetition(profile.nivelCompetencia);
  const D0 = profile.clientesPorMes;
  const ticket0 = profile.ticketPromedio;
  const sat0 = profile.satisfaccionBase;
  const rep0 = profile.reputacionBase;
  const capacidad0 = profile.capacidadMaximaMes;
  const costoVariable0 = profile.costoVariablePct;
  const fijos0 = profile.costosFijosMensuales;
  const marketing0 = profile.marketingMensual;
  const deuda0 = profile.cuotasDeudaMensuales;
  // La tendencia informada corresponde a los últimos 3 meses, por lo que la tasa mensual base es / 3
  const tendenciaMensual = (profile.derivatives.tendenciaMensualPct / 3) / 100;

  // Parámetros de decisión
  const priceChangePct = adjustedDecision?.priceChangePct ?? 0;
  const varCostDeltaPct = adjustedDecision?.varCostDeltaPct ?? 0;
  const capacityChangePct = adjustedDecision?.capacityChangePct ?? 0;
  const satisfactionPerMonth = adjustedDecision?.satisfactionPerMonth ?? 0;
  const fixedDelta = adjustedDecision?.fixedDelta ?? 0;
  const marketingDelta = adjustedDecision?.marketingDelta ?? 0;
  const oneTimeCost = adjustedDecision?.oneTimeCost ?? 0;

  let prevSat = initialStateOverride?.satisfaccion ?? sat0;
  let prevRep = initialStateOverride?.reputacion ?? rep0;
  let prevCaja = initialStateOverride?.caja ?? profile.cajaDisponible;

  let activeEventsList: TriggeredEvent[] = [];

  for (let t = 1; t <= horizon; t++) {
    // 1. Modificadores de eventos activos aplicados desde el mes siguiente al disparo
    let factorEventosDemanda = 1.0;
    let modifEventosSat = 0;
    let modifEventosFijos = 0;
    let elasticidadEfectiva = baseElasticidad;
    let fatigaActiva = false;

    for (const ev of activeEventsList) {
      if (ev.demandMultiplier) {
        if (ev.id === "fatiga_publicitaria") {
          fatigaActiva = true;
        } else {
          factorEventosDemanda *= ev.demandMultiplier;
        }
      }
      if (ev.satisfactionDelta) modifEventosSat += ev.satisfactionDelta;
      if (ev.fixedCostDelta) modifEventosFijos += ev.fixedCostDelta;
      if (ev.elasticityMultiplier) elasticidadEfectiva *= ev.elasticityMultiplier;
    }

    // 2. Fórmulas de demanda
    const lift_t = calculateDemandLift(adjustedDecision, t, horizon, fatigaActiva);
    const efectoPrecio = -elasticidadEfectiva * (priceChangePct / 100);
    const estacionalidad_t = getSeasonalityFactor(profile.estacionalidad, t);
    const efectoSatisfaccion = 1 + (prevSat - sat0) / 150;

    const baseDemandaCalculada =
      D0 *
      Math.pow(1 + tendenciaMensual, t) *
      estacionalidad_t *
      (1 + lift_t) *
      (1 + efectoPrecio) *
      efectoSatisfaccion *
      factorEventosDemanda;

    const demanda_t = Number(Math.max(0, baseDemandaCalculada).toFixed(2));

    // 3. Capacidad y atención
    const capacidad_t = Number(
      Math.max(1, capacidad0 * (1 + capacityChangePct / 100)).toFixed(2)
    );
    const atendidos_t = Number(Math.min(demanda_t, capacidad_t).toFixed(2));
    const exceso_t = Number(
      (Math.max(0, demanda_t - capacidad_t) / capacidad_t).toFixed(4)
    );

    // 4. Satisfacción y reputación
    // sat_t = clamp(sat_{t-1} + satisfactionPerMonth - 20 * exceso_t + modifEventos, 0, 100)
    const sat_t = clamp(
      prevSat + satisfactionPerMonth - 20 * exceso_t + modifEventosSat,
      0,
      100
    );
    // rep_t = clamp(rep_{t-1} + (sat_t - 70) / 10, 0, 100)
    const rep_t = clamp(prevRep + (sat_t - 70) / 10, 0, 100);

    // 5. Finanzas
    const ticket_t = Number((ticket0 * (1 + priceChangePct / 100)).toFixed(2));
    const cv_pct_t = clamp((costoVariable0 + varCostDeltaPct) / 100, 0, 1);

    const ingresos_t = Number((atendidos_t * ticket_t).toFixed(2));
    const costoVariable_t = Number((ingresos_t * cv_pct_t).toFixed(2));
    const costosFijos_t = Number(
      Math.max(0, fijos0 + fixedDelta + modifEventosFijos).toFixed(2)
    );
    const marketing_t = Number(Math.max(0, marketing0 + marketingDelta).toFixed(2));
    const deuda_t = Number(deuda0.toFixed(2));
    const oneTime_t = t === 1 ? Number(oneTimeCost.toFixed(2)) : 0;

    // Principio estricto: Beneficio = Ingresos - Costos Totales
    const costosTotales_t =
      costoVariable_t + costosFijos_t + marketing_t + deuda_t + oneTime_t;
    const beneficio_t = Number((ingresos_t - costosTotales_t).toFixed(2));
    const caja_t = Number((prevCaja + beneficio_t).toFixed(2));

    const currentMonthState: SimulationMonthState = {
      t,
      demanda: demanda_t,
      capacidad: capacidad_t,
      atendidos: atendidos_t,
      exceso: exceso_t,
      ticket: ticket_t,
      satisfaccion: Number(sat_t.toFixed(1)),
      reputacion: Number(rep_t.toFixed(1)),
      ingresos: ingresos_t,
      costoVariable: costoVariable_t,
      costosFijos: costosFijos_t,
      marketing: marketing_t,
      deuda: deuda_t,
      oneTimeCost: oneTime_t,
      beneficio: beneficio_t,
      caja: caja_t,
      activeEvents: [...activeEventsList],
    };

    months.push(currentMonthState);

    // 6. Evaluar eventos de segundo orden al cierre del mes t (aplicarán a partir de t+1)
    const newlyTriggered = evaluateSecondOrderEvents({
      t,
      currentMonth: currentMonthState,
      monthHistory: months,
      profile,
      decision: adjustedDecision,
      triggeredEventIds,
      stateCounters,
    });

    if (newlyTriggered.length > 0) {
      triggeredEventsAll.push(...newlyTriggered);
      activeEventsList = [...activeEventsList, ...newlyTriggered];
    }

    // Actualizar estado para la siguiente iteración
    prevSat = sat_t;
    prevRep = rep_t;
    prevCaja = caja_t;
  }

  // Resumen acumulado
  const beneficioAcumulado = Number(
    months.reduce((acc, m) => acc + m.beneficio, 0).toFixed(2)
  );
  const beneficioFinal = months[months.length - 1]?.beneficio ?? 0;
  const cajaMinima = Number(
    Math.min(...months.map((m) => m.caja)).toFixed(2)
  );
  const cajaFinal = months[months.length - 1]?.caja ?? 0;
  const clientesFinales = months[months.length - 1]?.atendidos ?? 0;
  const satisfaccionFinal = months[months.length - 1]?.satisfaccion ?? sat0;
  const reputacionFinal = months[months.length - 1]?.reputacion ?? rep0;

  // Payback Month: primer mes donde la caja acumulada generada cubre la inversión inicial
  let paybackMonth: number | null = null;
  if (oneTimeCost > 0) {
    let cumBeneficio = 0;
    for (const m of months) {
      cumBeneficio += m.beneficio + (m.t === 1 ? oneTimeCost : 0);
      if (cumBeneficio >= oneTimeCost) {
        paybackMonth = m.t;
        break;
      }
    }
  }

  return {
    runType,
    months,
    triggeredEvents: triggeredEventsAll,
    summary: {
      beneficioAcumulado,
      beneficioFinal,
      cajaMinima,
      cajaFinal,
      clientesFinales,
      satisfaccionFinal,
      reputacionFinal,
      paybackMonth,
    },
  };
}

/**
 * Ejecuta la simulación completa produciendo las 3 corridas de la banda de incertidumbre:
 * base, pesimista y optimista.
 */
export function simulateDecision(
  profile: NormalizedProfile,
  decision: Decision | undefined,
  horizon?: number,
  initialStateOverride?: Partial<SimulationMonthState>
): SimulationResult {
  const h = horizon ?? profile.horizonte;
  const base = runSingleSimulation(
    profile,
    decision,
    h,
    "base",
    initialStateOverride
  );
  const pesimista = runSingleSimulation(
    profile,
    decision,
    h,
    "pesimista",
    initialStateOverride
  );
  const optimista = runSingleSimulation(
    profile,
    decision,
    h,
    "optimista",
    initialStateOverride
  );

  return {
    decisionId: decision?.id,
    decisionName: decision?.name ?? "Sin cambios",
    horizon: h,
    base,
    pesimista,
    optimista,
  };
}
