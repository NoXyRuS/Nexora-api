import { describe, it, expect } from "vitest";
import {
  validateAndSanitizeDecisions,
  processAiDecisionsResponse,
  buildDecisionPrompt,
} from "../src/ai/decisions.js";
import {
  verifyExplanationNumbers,
  processAiExplanationResponse,
  buildExplanationPrompt,
} from "../src/ai/explain.js";
import { simulateDecision } from "../src/engine/simulate.js";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput } from "../src/types/index.js";

const baseForm: CaseFormInput = {
  rubro: "comercio",
  tipoOferta: "producto",
  moneda: "USD",
  clientesPorMes: 500,
  ticketPromedio: 50,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 30,
  costosFijosMensuales: 8000,
  marketingMensual: 1000,
  capacidadMaximaMes: 700,
  numeroEmpleados: 4,
  nivelCompetencia: "media",
  cajaDisponible: 10000, // Caja = 10,000
  satisfaccionClientes: 4,
  reputacion: 4,
  problemaPrincipal: {
    categoria: "ventas",
    descripcion: "Aumentar ventas",
  },
  objetivoPrioritario: "rentabilidad",
  restricciones: ["no bajar precios", "no despedir", "inversion máxima: 50000"],
  horizonte: 12,
};

describe("Módulo IA - Decisiones y Validación", () => {
  const profile = validateCaseForm(baseForm).profile!;

  it("construye el prompt del sistema A respetando las reglas de la especificación", () => {
    const { systemPrompt, userPrompt } = buildDecisionPrompt({
      profile,
      diagnosis: [],
    });
    expect(systemPrompt).toContain("consultor de negocios");
    expect(systemPrompt).toContain("NUNCA calcules ni menciones resultados");
    expect(userPrompt).toContain(profile.moneda);
  });

  it("aplica clamping a los valores fuera de rango", () => {
    const rawDecisionOutOfRange = [
      {
        id: "dec_out",
        name: "Decisión extrema",
        category: "precio",
        priceChangePct: 99, // Debe recortarse a 40
        varCostDeltaPct: -50, // Debe recortarse a -20
        capacityChangePct: 200, // Debe recortarse a 100
        satisfactionPerMonth: 10, // Debe recortarse a 3
        oneTimeCost: 1000,
        demandLift: { start: 10, end: 20, curve: "linear", lagMonths: 0 },
      },
    ];

    const { validDecisions } = validateAndSanitizeDecisions(
      rawDecisionOutOfRange,
      profile
    );
    const sanitized = validDecisions.find((d) => d.id === "dec_out");
    expect(sanitized).toBeDefined();
    expect(sanitized?.priceChangePct).toBe(40);
    expect(sanitized?.varCostDeltaPct).toBe(-20);
    expect(sanitized?.capacityChangePct).toBe(100);
    expect(sanitized?.satisfactionPerMonth).toBe(3);
  });

  it("descarta decisiones que violan restricciones explícitas del usuario", () => {
    const decisionsViolating = [
      {
        id: "dec_violates_price",
        name: "Rebaja general de precios",
        category: "precio",
        priceChangePct: -15, // Viola restricción "no bajar precios"
        oneTimeCost: 100,
        demandLift: { start: 10, end: 10, curve: "linear", lagMonths: 0 },
      },
      {
        id: "dec_violates_layoff",
        name: "Despido de personal para reducir fijos",
        category: "personal",
        fixedDelta: -2000, // Viola "no despedir"
        oneTimeCost: 100,
        demandLift: { start: 0, end: 0, curve: "linear", lagMonths: 0 },
      },
    ];

    const { validDecisions, discardedReasons } = validateAndSanitizeDecisions(
      decisionsViolating,
      profile
    );

    // Ambas deben haber sido descartadas
    expect(validDecisions.some((d) => d.id === "dec_violates_price")).toBe(false);
    expect(validDecisions.some((d) => d.id === "dec_violates_layoff")).toBe(false);
    expect(discardedReasons.length).toBeGreaterThanOrEqual(2);
  });

  it("criterio de aceptación 5: una decisión con costo mayor que la caja se marca requiresFinancing = true", () => {
    // Caja disponible = 10000, costo = 15000
    const decisionExpensive = [
      {
        id: "dec_expensive",
        name: "Compra de maquinaria de gran escala",
        category: "inversion",
        oneTimeCost: 15000, // > 10000 de caja
        priceChangePct: 0,
        varCostDeltaPct: -5,
        capacityChangePct: 30,
        demandLift: { start: 5, end: 15, curve: "linear", lagMonths: 1 },
      },
    ];

    const { validDecisions } = validateAndSanitizeDecisions(
      decisionExpensive,
      profile
    );
    const dec = validDecisions.find((d) => d.id === "dec_expensive");
    expect(dec).toBeDefined();
    // No se descarta, pero se marca requiresFinancing = true
    expect(dec?.requiresFinancing).toBe(true);
  });

  it("criterio de aceptación 4: un JSON inválido de la IA activa el respaldo", () => {
    const invalidJsonString = "{ error: no_es_json_valido ]";
    const res = processAiDecisionsResponse(invalidJsonString, profile);

    expect(res.usedFallback).toBe(true);
    // Debe haber devuelto las decisiones predefinidas para 'comercio'
    expect(res.decisions.length).toBeGreaterThanOrEqual(4);
    expect(res.decisions[0].id).toContain("fb_com");
  });
});

describe("Módulo IA - Explicación y Verificador de Cifras", () => {
  const profile = validateCaseForm(baseForm).profile!;
  const simResult = simulateDecision(profile, undefined, 12);

  it("construye el prompt del sistema B sin calcular resultados", () => {
    const { systemPrompt } = buildExplanationPrompt(simResult, profile);
    expect(systemPrompt).toContain("analista de negocios");
    expect(systemPrompt).toContain("Usa SOLO las cifras que aparecen en el JSON recibido");
  });

  it("criterio de aceptación 7: ninguna cifra inventada pasa el verificador", () => {
    const engineData = {
      summary: simResult.base.summary,
      events: simResult.base.triggeredEvents,
    };

    // Texto con cifra inventada ($987,654) que jamás calculó el motor
    const hallucinatedText = `La simulación muestra un beneficio de 987654 USD en el mes 12.`;
    const check = verifyExplanationNumbers(hallucinatedText, engineData);

    expect(check.isValid).toBe(false);
    expect(check.unverifiedNumbers).toContain(987654);

    // Al procesar la respuesta alucinada, debe activar automáticamente la plantilla de respaldo
    const output = processAiExplanationResponse(
      hallucinatedText,
      simResult,
      profile
    );
    expect(output.esPlantillaRespaldo).toBe(true);
    expect(output.cadenaCausal).toContain(
      String(simResult.base.summary.beneficioAcumulado)
    );
  });

  it("valida exitosamente un texto que utiliza solo cifras reales del motor", () => {
    const b = simResult.base.summary;
    const realText = `El beneficio acumulado fue de ${b.beneficioAcumulado} con una caja final de ${b.cajaFinal} en el mes 12.`;

    const engineData = {
      summary: b,
      events: simResult.base.triggeredEvents,
    };
    const check = verifyExplanationNumbers(realText, engineData);
    expect(check.isValid).toBe(true);
    expect(check.unverifiedNumbers).toHaveLength(0);

    const output = processAiExplanationResponse(realText, simResult, profile);
    expect(output.esPlantillaRespaldo).toBe(false);
  });
});
