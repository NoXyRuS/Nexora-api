// ============================================================================
// Comparación de Caminos, Punto de Divergencia y Ranking Ponderado
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  PathComparison,
  ComparisonResult,
  ObjetivoPrioritario,
} from "../types/index.js";
import { runSingleSimulation } from "../engine/simulate.js";

/**
 * Pesos ponderados transparentes para el ranking según el objetivo del usuario.
 */
export function getWeightsForObjective(
  objetivo: ObjetivoPrioritario
): Record<string, number> {
  switch (objetivo) {
    case "rentabilidad":
      return {
        beneficioAcumulado: 0.5,
        beneficioUltimoMes: 0.25,
        cajaMinima: 0.15,
        clientesFinales: 0.1,
      };
    case "crecimiento":
      return {
        clientesFinales: 0.45,
        reputacionFinal: 0.25,
        beneficioAcumulado: 0.2,
        satisfaccionFinal: 0.1,
      };
    case "estabilidad":
      return {
        cajaMinima: 0.45,
        beneficioAcumulado: 0.25,
        satisfaccionFinal: 0.15,
        eventosNegativos: 0.15, // penalización inversa
      };
    case "reducir_riesgo":
      return {
        eventosNegativos: 0.45, // penalización inversa
        cajaMinima: 0.35,
        satisfaccionFinal: 0.2,
      };
  }
}

/**
 * Calcula el primer mes donde dos curvas se separan más de un 5% (punto de divergencia).
 */
export function findDivergencePoint(
  baselineValues: number[],
  comparisonValues: number[]
): number | null {
  const length = Math.min(baselineValues.length, comparisonValues.length);
  for (let i = 0; i < length; i++) {
    const base = baselineValues[i];
    const comp = comparisonValues[i];
    const denominator = Math.max(1, Math.abs(base));
    const pctDiff = Math.abs(comp - base) / denominator;
    if (pctDiff > 0.05) {
      return i + 1; // Mes base 1-indexado
    }
  }
  return null;
}

/**
 * Normaliza un valor entre 0 y 1 para un conjunto de datos (Min-Max scaling).
 */
function normalizeMinMax(val: number, min: number, max: number): number {
  if (max === min) return 1.0;
  return (val - min) / (max - min);
}

/**
 * Compara múltiples decisiones contra la línea base "sin cambios".
 */
export function comparePaths(
  profile: NormalizedProfile,
  decisions: Decision[],
  horizon?: number
): ComparisonResult {
  const h = horizon ?? profile.horizonte;
  const sinCambios = runSingleSimulation(profile, undefined, h, "base");
  const baselineDemand = sinCambios.months.map((m) => m.demanda);

  const paths: PathComparison[] = [];
  const divergencePoints: Record<string, number | null> = {};

  for (const dec of decisions) {
    const sim = runSingleSimulation(profile, dec, h, "base");
    const pathDemand = sim.months.map((m) => m.demanda);
    divergencePoints[dec.id] = findDivergencePoint(baselineDemand, pathDemand);

    const negEventsCount = sim.triggeredEvents.filter(
      (e) => e.severity === "alta"
    ).length;

    const difVsSinCambios = {
      beneficioAcumulado: Number(
        (sim.summary.beneficioAcumulado - sinCambios.summary.beneficioAcumulado).toFixed(2)
      ),
      cajaFinal: Number(
        (sim.summary.cajaFinal - sinCambios.summary.cajaFinal).toFixed(2)
      ),
      clientesFinales: Number(
        (sim.summary.clientesFinales - sinCambios.summary.clientesFinales).toFixed(2)
      ),
    };

    paths.push({
      decisionId: dec.id,
      decisionName: dec.name,
      beneficioAcumulado: sim.summary.beneficioAcumulado,
      beneficioUltimoMes: sim.summary.beneficioFinal,
      cajaMinima: sim.summary.cajaMinima,
      paybackMonth: sim.summary.paybackMonth,
      satisfaccionFinal: sim.summary.satisfaccionFinal,
      reputacionFinal: sim.summary.reputacionFinal,
      clientesFinales: sim.summary.clientesFinales,
      eventosNegativos: negEventsCount,
      difVsSinCambios,
      score: 0,
    });
  }

  // Ranking Ponderado
  const weights = getWeightsForObjective(profile.objetivoPrioritario);

  // Rangos para normalización
  const minBeneficio = Math.min(...paths.map((p) => p.beneficioAcumulado), 0);
  const maxBeneficio = Math.max(...paths.map((p) => p.beneficioAcumulado), 1);

  const minBeneficioUltimo = Math.min(...paths.map((p) => p.beneficioUltimoMes), 0);
  const maxBeneficioUltimo = Math.max(...paths.map((p) => p.beneficioUltimoMes), 1);

  const minCaja = Math.min(...paths.map((p) => p.cajaMinima), 0);
  const maxCaja = Math.max(...paths.map((p) => p.cajaMinima), 1);

  const minClientes = Math.min(...paths.map((p) => p.clientesFinales), 0);
  const maxClientes = Math.max(...paths.map((p) => p.clientesFinales), 1);

  const minRep = Math.min(...paths.map((p) => p.reputacionFinal), 0);
  const maxRep = Math.max(...paths.map((p) => p.reputacionFinal), 100);

  const minSat = Math.min(...paths.map((p) => p.satisfaccionFinal), 0);
  const maxSat = Math.max(...paths.map((p) => p.satisfaccionFinal), 100);

  const maxEventos = Math.max(...paths.map((p) => p.eventosNegativos), 1);

  for (const path of paths) {
    let score = 0;
    if (weights.beneficioAcumulado) {
      score +=
        weights.beneficioAcumulado *
        normalizeMinMax(path.beneficioAcumulado, minBeneficio, maxBeneficio);
    }
    if (weights.beneficioUltimoMes) {
      score +=
        weights.beneficioUltimoMes *
        normalizeMinMax(path.beneficioUltimoMes, minBeneficioUltimo, maxBeneficioUltimo);
    }
    if (weights.cajaMinima) {
      score +=
        weights.cajaMinima * normalizeMinMax(path.cajaMinima, minCaja, maxCaja);
    }
    if (weights.clientesFinales) {
      score +=
        weights.clientesFinales *
        normalizeMinMax(path.clientesFinales, minClientes, maxClientes);
    }
    if (weights.reputacionFinal) {
      score +=
        weights.reputacionFinal *
        normalizeMinMax(path.reputacionFinal, minRep, maxRep);
    }
    if (weights.satisfaccionFinal) {
      score +=
        weights.satisfaccionFinal *
        normalizeMinMax(path.satisfaccionFinal, minSat, maxSat);
    }
    if (weights.eventosNegativos) {
      // Inverso: menos eventos negativos da mayor puntaje
      const penalizacion = 1 - path.eventosNegativos / maxEventos;
      score += weights.eventosNegativos * Math.max(0, penalizacion);
    }

    path.score = Number(score.toFixed(4));
  }

  // Ordenar ranking descendente por score
  const ranking = [...paths].sort((a, b) => b.score - a.score);

  return {
    sinCambios,
    paths,
    divergencePoints,
    usedWeights: weights,
    ranking,
  };
}
