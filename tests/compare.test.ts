import { describe, it, expect } from "vitest";
import {
  findDivergencePoint,
  comparePaths,
  getWeightsForObjective,
} from "../src/compare/metrics.js";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput, Decision } from "../src/types/index.js";

const baseForm: CaseFormInput = {
  rubro: "gastronomia",
  tipoOferta: "producto",
  moneda: "USD",
  clientesPorMes: 1000,
  ticketPromedio: 20,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 35,
  costosFijosMensuales: 7000,
  marketingMensual: 1000,
  capacidadMaximaMes: 1500,
  numeroEmpleados: 5,
  nivelCompetencia: "media",
  cajaDisponible: 15000,
  satisfaccionClientes: 4,
  reputacion: 4,
  problemaPrincipal: {
    categoria: "rentabilidad",
    descripcion: "Margen operativo bajo",
  },
  objetivoPrioritario: "rentabilidad",
  horizonte: 12,
};

const decisionAltaRentabilidad: Decision = {
  id: "dec_rentabilidad",
  name: "Optimización de costos y ajuste de precios",
  category: "precio",
  description: "Subir 10% precio y bajar 5% costo variable",
  oneTimeCost: 1000,
  fixedDelta: 0,
  marketingDelta: 0,
  priceChangePct: 10,
  varCostDeltaPct: -5,
  capacityChangePct: 0,
  demandLift: { start: 0, end: 0, curve: "linear", lagMonths: 0 },
  satisfactionPerMonth: 0,
  pros: ["Margen directo"],
  cons: ["Leve caída de demanda por elasticidad"],
  risks: ["Sensibilidad de clientes"],
  assumptions: [{ text: "Elasticidad promedio", confidence: "media" }],
  requiresFinancing: false,
};

const decisionVolumen: Decision = {
  id: "dec_volumen",
  name: "Campaña de volumen bajo margen",
  category: "marketing",
  description: "Descuento 15% y alto marketing",
  oneTimeCost: 5000,
  fixedDelta: 0,
  marketingDelta: 3000,
  priceChangePct: -15,
  varCostDeltaPct: 0,
  capacityChangePct: 10,
  demandLift: { start: 25, end: 35, curve: "linear", lagMonths: 0 },
  satisfactionPerMonth: 0,
  pros: ["Muchos clientes"],
  cons: ["Alto gasto"],
  risks: ["Presión en costos"],
  assumptions: [{ text: "Respuesta rápida", confidence: "media" }],
  requiresFinancing: false,
};

describe("Comparación de Caminos y Métricas", () => {
  it("detecta el punto de divergencia (> 5% de diferencia)", () => {
    const base = [100, 100, 100, 100, 100];
    const compIgual = [100, 102, 103, 104, 104]; // Máx 4% -> sin divergencia
    expect(findDivergencePoint(base, compIgual)).toBeNull();

    const compDiverge = [100, 102, 107, 110, 115]; // Mes 3 diverge (7% > 5%)
    expect(findDivergencePoint(base, compDiverge)).toBe(3);
  });

  it("calcula diferencias contra 'sin cambios' y métricas por camino", () => {
    const profile = validateCaseForm(baseForm).profile!;
    const res = comparePaths(
      profile,
      [decisionAltaRentabilidad, decisionVolumen],
      12
    );

    expect(res.sinCambios).toBeDefined();
    expect(res.paths.length).toBe(2);
    expect(res.usedWeights).toBeDefined();
    expect(res.ranking.length).toBe(2);

    const pathRent = res.paths.find((p) => p.decisionId === "dec_rentabilidad");
    expect(pathRent).toBeDefined();
    expect(pathRent?.difVsSinCambios.beneficioAcumulado).toBeDefined();
  });

  it("aplica ranking ponderado según el objetivo prioritario del usuario", () => {
    // Para 'rentabilidad': la decisión de optimización de margen debe superar a la de volumen
    const profileRentabilidad = validateCaseForm({
      ...baseForm,
      objetivoPrioritario: "rentabilidad",
    }).profile!;

    const weightsRent = getWeightsForObjective("rentabilidad");
    expect(weightsRent.beneficioAcumulado).toBe(0.5);

    const resRent = comparePaths(
      profileRentabilidad,
      [decisionAltaRentabilidad, decisionVolumen],
      12
    );
    expect(resRent.ranking[0].decisionId).toBe("dec_rentabilidad");

    // Para 'crecimiento': la decisión de volumen debe ganar más peso
    const profileCrecimiento = validateCaseForm({
      ...baseForm,
      objetivoPrioritario: "crecimiento",
    }).profile!;

    const weightsCrec = getWeightsForObjective("crecimiento");
    expect(weightsCrec.clientesFinales).toBe(0.45);

    const resCrec = comparePaths(
      profileCrecimiento,
      [decisionAltaRentabilidad, decisionVolumen],
      12
    );
    expect(resCrec.ranking[0].decisionId).toBe("dec_volumen");
  });
});
