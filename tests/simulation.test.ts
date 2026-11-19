import { describe, it, expect } from "vitest";
import { simulateDecision, runSingleSimulation } from "../src/engine/simulate.js";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput, Decision } from "../src/types/index.js";

const baseForm: CaseFormInput = {
  rubro: "servicios",
  tipoOferta: "servicio",
  moneda: "USD",
  clientesPorMes: 500,
  ticketPromedio: 100,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 30,
  costosFijosMensuales: 15000,
  marketingMensual: 2000,
  capacidadMaximaMes: 600,
  numeroEmpleados: 6,
  nivelCompetencia: "media",
  cajaDisponible: 30000,
  satisfaccionClientes: 4, // 80 / 100
  reputacion: 4,
  problemaPrincipal: {
    categoria: "ventas",
    descripcion: "Incrementar cartera de clientes",
  },
  objetivoPrioritario: "crecimiento",
  horizonte: 12,
};

const sampleDecision: Decision = {
  id: "dec_expansion",
  name: "Campaña de adquisición agresiva",
  category: "marketing",
  description: "Inversión en pauta digital",
  oneTimeCost: 5000,
  fixedDelta: 1000,
  marketingDelta: 2000,
  priceChangePct: 0,
  varCostDeltaPct: 0,
  capacityChangePct: 20, // Aumenta capacidad a 720
  demandLift: { start: 10, end: 30, curve: "linear", lagMonths: 1 },
  satisfactionPerMonth: 0.5,
  pros: ["Aumento de demanda rápida"],
  cons: ["Mayor gasto en marketing"],
  risks: ["Fatiga publicitaria"],
  assumptions: [{ text: "Conversión de leads estable", confidence: "baja" }],
  requiresFinancing: false,
};

describe("Motor de Simulación Determinista", () => {
  const profile = validateCaseForm(baseForm).profile!;

  it("garantiza determinismo: misma entrada produce exactamente el mismo resultado", () => {
    const run1 = simulateDecision(profile, sampleDecision, 12);
    const run2 = simulateDecision(profile, sampleDecision, 12);

    expect(JSON.stringify(run1)).toEqual(JSON.stringify(run2));
  });

  it("comprueba que beneficio = ingresos - todos los costos en cada mes", () => {
    const res = runSingleSimulation(profile, sampleDecision, 12);
    for (const m of res.months) {
      const costosTotales =
        m.costoVariable + m.costosFijos + m.marketing + m.deuda + m.oneTimeCost;
      const beneficioCalculado = Number((m.ingresos - costosTotales).toFixed(2));
      expect(m.beneficio).toBeCloseTo(beneficioCalculado, 2);
    }
  });

  it("penaliza la satisfacción cuando la demanda supera la capacidad", () => {
    // Escenario de sobrecarga: demanda 800 pero capacidad solo 400
    const overCapacityForm = {
      ...baseForm,
      clientesPorMes: 800,
      capacidadMaximaMes: 400,
    };
    const pOver = validateCaseForm(overCapacityForm).profile!;
    // Sin decisión para ver el efecto puro del exceso
    const res = runSingleSimulation(pOver, undefined, 6);

    // En cada mes con exceso > 0, la satisfacción debe caer progresivamente
    expect(res.months[0].exceso).toBeGreaterThan(0);
    expect(res.months[5].satisfaccion).toBeLessThan(pOver.satisfaccionBase);
  });

  it("dispara evento colas cuando exceso > 5% durante 2 meses consecutivos", () => {
    const overCapacityForm = {
      ...baseForm,
      clientesPorMes: 700,
      capacidadMaximaMes: 500, // exceso = (700-500)/500 = 40% > 5%
    };
    const pOver = validateCaseForm(overCapacityForm).profile!;
    const res = runSingleSimulation(pOver, undefined, 6);

    const eventoColas = res.triggeredEvents.find((e) => e.id === "colas");
    expect(eventoColas).toBeDefined();
    // Debe dispararse exactamente en el mes 2 (tras 2 meses con exceso)
    expect(eventoColas?.triggeredAtMonth).toBe(2);
  });

  it("aplica banda de incertidumbre (pesimista vs optimista) cuando hay supuestos con confianza baja", () => {
    const res = simulateDecision(profile, sampleDecision, 12);
    // Pesimista debe tener menor o igual beneficio acumulado que Base
    expect(res.pesimista.summary.beneficioAcumulado).toBeLessThan(
      res.base.summary.beneficioAcumulado
    );
    // Optimista debe tener mayor beneficio acumulado que Base
    expect(res.optimista.summary.beneficioAcumulado).toBeGreaterThan(
      res.base.summary.beneficioAcumulado
    );
  });

  it("simula correctamente un negocio con 1 cliente diario (30/mes) reflejando el lift de campaña (+10%)", () => {
    const lowVolumeForm: CaseFormInput = {
      ...baseForm,
      clientesPorMes: 30, // 1 cliente diario
      capacidadMaximaMes: 50,
      tendenciaUltimos3Meses: { tipo: "cayendo", porcentaje: 12 },
    };
    const pLow = validateCaseForm(lowVolumeForm).profile!;
    const campaignDecision: Decision = {
      ...sampleDecision,
      demandLift: { start: 10, end: 10, curve: "linear", lagMonths: 0 },
    };
    const res = runSingleSimulation(pLow, campaignDecision, 3);
    // En mes 1: con tasa mensual ajustada a 12/3 = 4% y lift +10%, atendidos supera la caída base (30 * 0.96 * 1.10 = ~31.68)
    expect(res.months[0].atendidos).toBeGreaterThan(30);
    // Comprobar que no es 0 ni se pierde por redondeo
    expect(res.months[0].atendidos).toBeCloseTo(31.68, 1);
  });
});
