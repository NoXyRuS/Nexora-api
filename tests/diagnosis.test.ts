import { describe, it, expect } from "vitest";
import { runRuleBasedDiagnosis } from "../src/diagnosis/rules.js";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput } from "../src/types/index.js";

const baseForm: CaseFormInput = {
  rubro: "comercio",
  tipoOferta: "producto",
  moneda: "USD",
  clientesPorMes: 500,
  ticketPromedio: 100,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 50,
  costosFijosMensuales: 10000,
  marketingMensual: 2000,
  capacidadMaximaMes: 1000,
  numeroEmpleados: 5,
  nivelCompetencia: "media",
  cajaDisponible: 50000,
  satisfaccionClientes: 4,
  reputacion: 4,
  problemaPrincipal: {
    categoria: "estrategia",
    descripcion: "Crecimiento estancado",
  },
  objetivoPrioritario: "crecimiento",
  horizonte: 12,
};

describe("Módulo Diagnosis por Reglas", () => {
  it("detecta capacidad_limitada cuando utilización > 0.85", () => {
    const res = validateCaseForm({
      ...baseForm,
      clientesPorMes: 900,
      capacidadMaximaMes: 1000, // 90%
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    const l = labels.find((x) => x.code === "capacidad_limitada");
    expect(l).toBeDefined();
    expect(l?.severity).toBe("media");
  });

  it("detecta capacidad_ociosa cuando utilización < 0.5", () => {
    const res = validateCaseForm({
      ...baseForm,
      clientesPorMes: 300,
      capacidadMaximaMes: 1000, // 30% -> severidad alta
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    const l = labels.find((x) => x.code === "capacidad_ociosa");
    expect(l).toBeDefined();
    expect(l?.severity).toBe("alta");
  });

  it("detecta margen_bajo y liquidez_critica en escenarios de pérdida", () => {
    const res = validateCaseForm({
      ...baseForm,
      costosFijosMensuales: 30000, // Ingresos 50000 - CV 25000 - Fijos 30000 = Beneficio negativo
      cajaDisponible: 5000, // Runway muy corto
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    expect(labels.some((x) => x.code === "margen_bajo")).toBe(true);
    expect(labels.some((x) => x.code === "liquidez_critica")).toBe(true);
  });

  it("detecta demanda_en_caida cuando tendencia < -5%", () => {
    const res = validateCaseForm({
      ...baseForm,
      tendenciaUltimos3Meses: { tipo: "cayendo", porcentaje: 18 },
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    const l = labels.find((x) => x.code === "demanda_en_caida");
    expect(l).toBeDefined();
    expect(l?.severity).toBe("alta"); // <= -15%
  });

  it("detecta marketing_pesado cuando supera 15% de ingresos", () => {
    const res = validateCaseForm({
      ...baseForm,
      clientesPorMes: 100,
      ticketPromedio: 100, // Ingresos = 10000
      marketingMensual: 2500, // 25% de ingresos
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    expect(labels.some((x) => x.code === "marketing_pesado")).toBe(true);
  });

  it("detecta servicio_debil cuando satisfacción < 65/100", () => {
    const res = validateCaseForm({
      ...baseForm,
      satisfaccionClientes: 2.5, // 50/100
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    expect(labels.some((x) => x.code === "servicio_debil")).toBe(true);
  });

  it("detecta presion_competitiva cuando el nivel de competencia es alta", () => {
    const res = validateCaseForm({
      ...baseForm,
      nivelCompetencia: "alta",
    });
    const labels = runRuleBasedDiagnosis(res.profile!);
    const l = labels.find((x) => x.code === "presion_competitiva");
    expect(l).toBeDefined();
    expect(l?.severity).toBe("alta");
  });
});
