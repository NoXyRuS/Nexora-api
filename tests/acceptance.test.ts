// ============================================================================
// Pruebas Unitarias de Criterios de Aceptación (No Negociables)
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  validateCaseForm,
  simulateDecision,
  runSingleSimulation,
  createInitialTree,
  simulateCounterfactual,
  processAiDecisionsResponse,
  validateAndSanitizeDecisions,
  verifyExplanationNumbers,
  processAiExplanationResponse,
  serializeSession,
  deserializeSession,
  createNewSession,
  CaseFormInput,
  Decision,
} from "../src/index.js";

const baseCaseForm: CaseFormInput = {
  rubro: "servicios",
  tipoOferta: "servicio",
  moneda: "USD",
  descripcionLibre: "Agencia de diseño y desarrollo web",
  clientesPorMes: 400,
  ticketPromedio: 150,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 25,
  costosFijosMensuales: 20000,
  marketingMensual: 3000,
  cuotasDeudaMensuales: 1000,
  capacidadMaximaMes: 500,
  numeroEmpleados: 10,
  nivelCompetencia: "media",
  cajaDisponible: 12000, // Caja = 12,000 USD
  satisfaccionClientes: 4.2,
  reputacion: 4.0,
  problemaPrincipal: {
    categoria: "rentabilidad",
    descripcion: "Bajo margen neto tras costos fijos",
  },
  objetivoPrioritario: "rentabilidad",
  restricciones: ["no despedir", "no bajar precios"],
  horizonte: 12,
};

const sampleDecision: Decision = {
  id: "dec_consultoria",
  name: "Servicio de consultoría avanzada",
  category: "producto",
  description: "Paquetes de consultoría estratégica de alto ticket",
  oneTimeCost: 4000,
  fixedDelta: 1500,
  marketingDelta: 1000,
  priceChangePct: 15,
  varCostDeltaPct: -3,
  capacityChangePct: 10,
  demandLift: { start: 5, end: 20, curve: "linear", lagMonths: 1 },
  satisfactionPerMonth: 0.5,
  pros: ["Incremento de ticket"],
  cons: ["Mayor tiempo de consultor senior"],
  risks: ["Ciclo de venta más lento"],
  assumptions: [{ text: "Mercado receptivo a servicios premium", confidence: "baja" }],
  requiresFinancing: false,
};

describe("Criterios de Aceptación No Negociables «Efecto Mariposa»", () => {
  const profile = validateCaseForm(baseCaseForm).profile!;

  // --------------------------------------------------------------------------
  // Criterio 1: Misma entrada produce el mismo resultado (Determinismo)
  // --------------------------------------------------------------------------
  it("Criterio 1: Misma entrada produce el mismo resultado (Determinismo)", () => {
    const run1 = simulateDecision(profile, sampleDecision, 12);
    const run2 = simulateDecision(profile, sampleDecision, 12);

    expect(run1).toEqual(run2);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  // --------------------------------------------------------------------------
  // Criterio 2: Si la demanda supera la capacidad, la satisfacción baja
  // --------------------------------------------------------------------------
  it("Criterio 2: Si la demanda supera la capacidad, la satisfacción baja", () => {
    // Configuramos un escenario donde la demanda de clientes supera holgadamente la capacidad
    const overloadedForm: CaseFormInput = {
      ...baseCaseForm,
      clientesPorMes: 800,
      capacidadMaximaMes: 400, // Utilización = 200% (exceso de demanda)
    };
    const overloadedProfile = validateCaseForm(overloadedForm).profile!;
    const sim = runSingleSimulation(overloadedProfile, undefined, 6);

    // En el primer mes con exceso, la satisfacción debe ser menor que la base inicial
    expect(sim.months[0].exceso).toBeGreaterThan(0);
    expect(sim.months[0].satisfaccion).toBeLessThan(
      overloadedProfile.satisfaccionBase
    );

    // Y debe continuar erosionándose en los meses siguientes por exceso sostenido
    expect(sim.months[5].satisfaccion).toBeLessThan(sim.months[0].satisfaccion);
  });

  // --------------------------------------------------------------------------
  // Criterio 3: Beneficio = ingresos − todos los costos en cada mes
  // --------------------------------------------------------------------------
  it("Criterio 3: Beneficio = ingresos − todos los costos en cada mes", () => {
    const sim = runSingleSimulation(profile, sampleDecision, 12);

    for (const m of sim.months) {
      const costosTotales =
        m.costoVariable + m.costosFijos + m.marketing + m.deuda + m.oneTimeCost;
      const beneficioEsperado = Number((m.ingresos - costosTotales).toFixed(2));

      expect(m.beneficio).toBeCloseTo(beneficioEsperado, 2);
    }
  });

  // --------------------------------------------------------------------------
  // Criterio 4: Un JSON inválido de la IA activa el respaldo
  // --------------------------------------------------------------------------
  it("Criterio 4: Un JSON inválido de la IA activa el respaldo", () => {
    const malformedJsonString =
      '{"error": "IA devolvió texto incompleto con sintaxis inválida...';
    const result = processAiDecisionsResponse(malformedJsonString, profile);

    expect(result.usedFallback).toBe(true);
    expect(result.decisions.length).toBeGreaterThanOrEqual(4);
    // Verifica que se cargaron las decisiones predefinidas del rubro correspondiente
    expect(result.decisions[0].id).toContain("fb_ser");
  });

  // --------------------------------------------------------------------------
  // Criterio 5: Una decisión con costo mayor que la caja se marca requiresFinancing
  // --------------------------------------------------------------------------
  it("Criterio 5: Una decisión con costo mayor que la caja se marca requiresFinancing", () => {
    // La caja disponible del perfil es 12,000 USD.
    // Proponemos una decisión con oneTimeCost = 25,000 USD (mayor que la caja)
    const expensiveDecision = [
      {
        id: "dec_inversion_alta",
        name: "Renovación completa de infraestructura",
        category: "inversion",
        oneTimeCost: 25000, // > 12,000
        priceChangePct: 0,
        varCostDeltaPct: -5,
        capacityChangePct: 40,
        demandLift: { start: 10, end: 20, curve: "linear", lagMonths: 1 },
      },
    ];

    const { validDecisions } = validateAndSanitizeDecisions(
      expensiveDecision,
      profile
    );
    const decision = validDecisions.find((d) => d.id === "dec_inversion_alta");

    expect(decision).toBeDefined();
    // La decisión NO debe ser descartada, sino marcada con requiresFinancing = true
    expect(decision?.requiresFinancing).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Criterio 6: El contrafactual coincide con una simulación directa desde el mismo nodo
  // --------------------------------------------------------------------------
  it("Criterio 6: El contrafactual coincide con una simulación directa desde el mismo nodo", () => {
    const tree = createInitialTree(profile);

    // Corrida directa de referencia ejecutada por el motor
    const directRun = runSingleSimulation(profile, sampleDecision, 12, "base");

    // Ejecución contrafactual ramificada desde el nodo raíz en el árbol
    const { updatedTree } = simulateCounterfactual(
      tree,
      "root",
      sampleDecision,
      profile
    );

    // Localizar el nodo de resultado de horizonte 12 en el árbol
    const resultNodeH12 = Object.values(updatedTree.nodes).find(
      (n) =>
        n.type === "resultado" &&
        n.decisionId === sampleDecision.id &&
        n.horizon === 12
    );

    expect(resultNodeH12).toBeDefined();
    // El snapshot mensual de caja y beneficio acumulado debe ser exactamente idéntico
    expect(resultNodeH12?.stateSnapshot.caja).toBe(directRun.summary.cajaFinal);
    expect(resultNodeH12?.metrics.beneficioAcumulado).toBe(
      directRun.summary.beneficioAcumulado
    );
    expect(resultNodeH12?.stateSnapshot.atendidos).toBe(
      directRun.summary.clientesFinales
    );
  });

  // --------------------------------------------------------------------------
  // Criterio 7: Ninguna cifra inventada pasa el verificador
  // --------------------------------------------------------------------------
  it("Criterio 7: Ninguna cifra inventada pasa el verificador", () => {
    const simResult = simulateDecision(profile, sampleDecision, 12);
    const engineData = {
      summary: simResult.base.summary,
      events: simResult.base.triggeredEvents,
    };

    // Texto con cifras ficticias o alucinadas que no existen en los cálculos del motor
    const textWithInventedNumber =
      "La estrategia producirá exactamente 876543 USD en ingresos netos garantizados.";

    const verification = verifyExplanationNumbers(
      textWithInventedNumber,
      engineData
    );
    expect(verification.isValid).toBe(false);
    expect(verification.unverifiedNumbers).toContain(876543);

    // Al procesar la respuesta alucinada a través del pipeline, se activa automáticamente la plantilla determinista
    const explanation = processAiExplanationResponse(
      textWithInventedNumber,
      simResult,
      profile
    );
    expect(explanation.esPlantillaRespaldo).toBe(true);
    // La plantilla contiene únicamente cifras auditadas del motor
    expect(explanation.cadenaCausal).toContain(
      String(simResult.base.summary.beneficioAcumulado)
    );
  });

  // --------------------------------------------------------------------------
  // Persistencia de Sesión Versionada
  // --------------------------------------------------------------------------
  it("serializa y deserializa una sesión versionada sin pérdida de información", () => {
    const tree = createInitialTree(profile);
    const session = createNewSession(profile, tree, [sampleDecision]);
    const serialized = serializeSession(session);

    expect(serialized).toContain('"version": "1.0.0"');

    const deserialized = deserializeSession(serialized);
    expect(deserialized.version).toBe("1.0.0");
    expect(deserialized.profile.rubro).toBe(profile.rubro);
    expect(deserialized.tree.rootId).toBe("root");
  });
});
