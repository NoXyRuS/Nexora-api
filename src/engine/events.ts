// ============================================================================
// Catálogo de Eventos de Segundo Orden
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  SimulationMonthState,
  TriggeredEvent,
} from "../types/index.js";

export interface EventEvaluationContext {
  t: number;
  currentMonth: SimulationMonthState;
  monthHistory: SimulationMonthState[];
  profile: NormalizedProfile;
  decision?: Decision;
  triggeredEventIds: Set<string>;
  stateCounters: {
    consecutiveExcessMonths: number;
    consecutiveHighUtilMonths: number;
    marketingDeltaMonths: number;
  };
}

/**
 * Evalúa las condiciones para disparar eventos de segundo orden al cierre del mes t.
 * Regla: Se aplican a partir del mes siguiente (t+1) y se disparan UNA SOLA VEZ por rama.
 */
export function evaluateSecondOrderEvents(
  ctx: EventEvaluationContext
): TriggeredEvent[] {
  const newEvents: TriggeredEvent[] = [];
  const { currentMonth, profile, decision, triggeredEventIds, stateCounters, t } = ctx;

  // Actualizar contadores acumulados
  if (currentMonth.exceso > 0.05) {
    stateCounters.consecutiveExcessMonths += 1;
  } else {
    stateCounters.consecutiveExcessMonths = 0;
  }

  const utilActual =
    currentMonth.capacidad > 0
      ? currentMonth.atendidos / currentMonth.capacidad
      : 1;
  if (utilActual > 0.95) {
    stateCounters.consecutiveHighUtilMonths += 1;
  } else {
    stateCounters.consecutiveHighUtilMonths = 0;
  }

  if (decision && decision.marketingDelta > 0) {
    stateCounters.marketingDeltaMonths += 1;
  }

  // 1. colas: exceso > 5% durante 2 meses seguidos -> satisfacción -2/mes y pérdida de recurrentes (demanda -3%)
  if (!triggeredEventIds.has("colas") && stateCounters.consecutiveExcessMonths >= 2) {
    const event: TriggeredEvent = {
      id: "colas",
      name: "Colapso por colas y sobrecapacidad",
      triggeredAtMonth: t,
      durationMonths: 6,
      severity: "alta",
      message:
        "El exceso de demanda continuo deterioró la experiencia. Pérdida de clientes recurrentes (-3% demanda) y -2 en satisfacción mensual.",
      demandMultiplier: 0.97,
      satisfactionDelta: -2,
    };
    newEvents.push(event);
    triggeredEventIds.add("colas");
  }

  // 2. boca_a_boca: satisfacción > 80 -> demanda +3%
  if (!triggeredEventIds.has("boca_a_boca") && currentMonth.satisfaccion > 80) {
    const event: TriggeredEvent = {
      id: "boca_a_boca",
      name: "Boca a boca positivo",
      triggeredAtMonth: t,
      durationMonths: 6,
      severity: "baja",
      message:
        "Clientes altamente satisfechos recomiendan el negocio de forma orgánica (+3% de demanda).",
      demandMultiplier: 1.03,
    };
    newEvents.push(event);
    triggeredEventIds.add("boca_a_boca");
  }

  // 3. fatiga_publicitaria: marketingDelta > 0 durante más de 4 meses -> lift se reduce 30%
  if (
    !triggeredEventIds.has("fatiga_publicitaria") &&
    stateCounters.marketingDeltaMonths > 4
  ) {
    const event: TriggeredEvent = {
      id: "fatiga_publicitaria",
      name: "Fatiga publicitaria de audiencia",
      triggeredAtMonth: t,
      durationMonths: 6,
      severity: "media",
      message:
        "Saturación en canales de adquisición reduce la efectividad del incremento en demanda un 30%.",
      demandMultiplier: 0.7, // Reduce lift efectivo
    };
    newEvents.push(event);
    triggeredEventIds.add("fatiga_publicitaria");
  }

  // 4. respuesta_competidor: competencia alta y bajada de precio > 10% -> desde mes 4 la elasticidad efectiva baja 50%
  if (
    !triggeredEventIds.has("respuesta_competidor") &&
    profile.nivelCompetencia === "alta" &&
    decision &&
    decision.priceChangePct < -10 &&
    t >= 4
  ) {
    const event: TriggeredEvent = {
      id: "respuesta_competidor",
      name: "Guerra de precios de la competencia",
      triggeredAtMonth: t,
      durationMonths: 12,
      severity: "alta",
      message:
        "Los competidores igualaron tu rebaja de precios. La elasticidad y efectividad del descuento cae un 50%.",
      elasticityMultiplier: 0.5,
    };
    newEvents.push(event);
    triggeredEventIds.add("respuesta_competidor");
  }

  // 5. crisis_liquidez: caja < 0 -> no se pueden aplicar nuevas inversiones y satisfacción baja (-3/mes)
  if (!triggeredEventIds.has("crisis_liquidez") && currentMonth.caja < 0) {
    const event: TriggeredEvent = {
      id: "crisis_liquidez",
      name: "Crisis de liquidez (Caja negativa)",
      triggeredAtMonth: t,
      durationMonths: 12,
      severity: "alta",
      message:
        "Falta de solvencia operacional. Se congela capacidad operativa y cae la satisfacción -3 por mes por desabastecimiento.",
      satisfactionDelta: -3,
    };
    newEvents.push(event);
    triggeredEventIds.add("crisis_liquidez");
  }

  // 6. desgaste_equipo: utilización > 95% durante 3 meses -> costo fijo sube por rotación (10%)
  if (
    !triggeredEventIds.has("desgaste_equipo") &&
    stateCounters.consecutiveHighUtilMonths >= 3
  ) {
    const costoPersonal =
      profile.desgloseCostosFijos?.personal ?? profile.costosFijosMensuales * 0.5;
    const incrementoFijo = costoPersonal * 0.1;

    const event: TriggeredEvent = {
      id: "desgaste_equipo",
      name: "Desgaste y rotación de personal (Burnout)",
      triggeredAtMonth: t,
      durationMonths: 6,
      severity: "media",
      message:
        `Sobrecarga extrema sostenida durante 3 meses genera renuncias y costos de contratación (+${incrementoFijo.toFixed(
          0
        )} en costos fijos).`,
      fixedCostDelta: incrementoFijo,
    };
    newEvents.push(event);
    triggeredEventIds.add("desgaste_equipo");
  }

  return newEvents;
}
