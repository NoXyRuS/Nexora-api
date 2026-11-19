import { describe, it, expect } from "vitest";
import {
  createInitialTree,
  addDecisionBranch,
  setActiveNode,
  simulateCounterfactual,
} from "../src/tree/build.js";
import { runSingleSimulation } from "../src/engine/simulate.js";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput, Decision } from "../src/types/index.js";

const baseForm: CaseFormInput = {
  rubro: "comercio",
  tipoOferta: "producto",
  moneda: "USD",
  clientesPorMes: 400,
  ticketPromedio: 80,
  tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
  costoVariablePct: 40,
  costosFijosMensuales: 10000,
  marketingMensual: 1000,
  capacidadMaximaMes: 500,
  numeroEmpleados: 4,
  nivelCompetencia: "media",
  cajaDisponible: 25000,
  satisfaccionClientes: 4,
  reputacion: 4,
  problemaPrincipal: {
    categoria: "ventas",
    descripcion: "Baja recurrencia",
  },
  objetivoPrioritario: "rentabilidad",
  horizonte: 12,
};

const decisionA: Decision = {
  id: "dec_a",
  name: "Programa de fidelización",
  category: "fidelizacion",
  description: "Club de beneficios",
  oneTimeCost: 2000,
  fixedDelta: 300,
  marketingDelta: 500,
  priceChangePct: 5,
  varCostDeltaPct: 0,
  capacityChangePct: 0,
  demandLift: { start: 5, end: 15, curve: "linear", lagMonths: 1 },
  satisfactionPerMonth: 1,
  pros: ["Mayor retención"],
  cons: ["Costo mensual fijo"],
  risks: ["Adopción lenta"],
  assumptions: [{ text: "Adopción del 30%", confidence: "media" }],
  requiresFinancing: false,
};

const decisionB: Decision = {
  id: "dec_b",
  name: "Campaña de descuento agresivo",
  category: "precio",
  description: "Descuento del 15% temporal",
  oneTimeCost: 500,
  fixedDelta: 0,
  marketingDelta: 1000,
  priceChangePct: -15,
  varCostDeltaPct: 0,
  capacityChangePct: 0,
  demandLift: { start: 20, end: 10, curve: "pulse", lagMonths: 0 },
  satisfactionPerMonth: 0,
  pros: ["Volumen rápido"],
  cons: ["Menor margen"],
  risks: ["Guerra de precios"],
  assumptions: [{ text: "Reacción competidora nula", confidence: "baja" }],
  requiresFinancing: false,
};

describe("Árbol de Consecuencias y Contrafactuales", () => {
  const profile = validateCaseForm(baseForm).profile!;

  it("inicializa el árbol con el nodo raíz", () => {
    const tree = createInitialTree(profile);
    expect(tree.rootId).toBe("root");
    expect(tree.nodes["root"]).toBeDefined();
    expect(tree.nodes["root"].type).toBe("raiz");
    expect(tree.nodes["root"].childrenIds).toHaveLength(0);
  });

  it("genera ramas de decisión y nodos de resultado por horizonte (1, 6, 12)", () => {
    const tree = createInitialTree(profile);
    const { updatedTree, decisionNodeId } = addDecisionBranch(
      tree,
      "root",
      decisionA,
      profile
    );

    expect(updatedTree.nodes[decisionNodeId]).toBeDefined();
    expect(updatedTree.nodes["root"].childrenIds).toContain(decisionNodeId);

    const resultNodes = Object.values(updatedTree.nodes).filter(
      (n) => n.type === "resultado" && n.decisionId === decisionA.id
    );
    expect(resultNodes.length).toBe(3); // Horizontes 1, 6, 12
    const horizons = resultNodes.map((n) => n.horizon);
    expect(horizons).toContain(1);
    expect(horizons).toContain(6);
    expect(horizons).toContain(12);
  });

  it("cambiar el nodo activo conserva todas las ramas hermanas", () => {
    const tree = createInitialTree(profile);
    const { updatedTree: treeWithA } = addDecisionBranch(
      tree,
      "root",
      decisionA,
      profile
    );
    const { updatedTree: treeWithAB } = addDecisionBranch(
      treeWithA,
      "root",
      decisionB,
      profile
    );

    const totalNodesBefore = Object.keys(treeWithAB.nodes).length;
    const switchedTree = setActiveNode(treeWithAB, "root");

    expect(switchedTree.activeNodeId).toBe("root");
    expect(Object.keys(switchedTree.nodes).length).toBe(totalNodesBefore);
    // Ambas ramas de decisión siguen existiendo
    expect(switchedTree.nodes["root"].childrenIds.length).toBe(2);
  });

  it("criterio de aceptación 6: el contrafactual coincide con una simulación directa desde el mismo nodo", () => {
    const tree = createInitialTree(profile);
    // Simulación directa del motor desde la raíz con decisionB
    const directSim = runSingleSimulation(profile, decisionB, 12, "base");

    // Simulación contrafactual desde la raíz en el árbol
    const { updatedTree } = simulateCounterfactual(
      tree,
      "root",
      decisionB,
      profile
    );

    // Buscar el nodo resultado de horizonte 12 en el árbol
    const nodeH12 = Object.values(updatedTree.nodes).find(
      (n) => n.type === "resultado" && n.decisionId === decisionB.id && n.horizon === 12
    );

    expect(nodeH12).toBeDefined();
    // Las métricas finales del nodo en el árbol deben ser exactamente idénticas a la corrida directa
    expect(nodeH12?.stateSnapshot.caja).toBe(directSim.summary.cajaFinal);
    expect(nodeH12?.metrics.beneficioAcumulado).toBe(
      directSim.summary.beneficioAcumulado
    );
    expect(nodeH12?.stateSnapshot.atendidos).toBe(
      directSim.summary.clientesFinales
    );
  });

  it("permite encadenar decisiones desde un nodo de resultado hasta un máximo de profundidad 3", () => {
    const tree = createInitialTree(profile);
    // Nivel 1
    const { updatedTree: tree1 } = addDecisionBranch(
      tree,
      "root",
      decisionA,
      profile
    );
    const resNode1 = Object.values(tree1.nodes).find(
      (n) => n.type === "resultado" && n.horizon === 12
    )!;

    // Nivel 2 (seguimiento)
    const { updatedTree: tree2 } = addDecisionBranch(
      tree1,
      resNode1.id,
      decisionB,
      profile
    );
    const resNode2 = Object.values(tree2.nodes).find(
      (n) => n.type === "resultado" && n.parentId?.includes(decisionB.id) && n.horizon === 12
    )!;
    expect(resNode2).toBeDefined();

    // Nivel 3
    const { updatedTree: tree3 } = addDecisionBranch(
      tree2,
      resNode2.id,
      decisionA,
      profile
    );
    const resNode3 = Object.values(tree3.nodes).find(
      (n) => n.depth === 3 && n.type === "resultado" && n.horizon === 12
    )!;
    expect(resNode3).toBeDefined();

    // Intentar Nivel 4 debe lanzar error por superar la profundidad máxima
    expect(() =>
      addDecisionBranch(tree3, resNode3.id, decisionB, profile)
    ).toThrow(/profundidad/i);
  });
});
