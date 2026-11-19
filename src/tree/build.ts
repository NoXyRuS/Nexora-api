// ============================================================================
// Árbol de Consecuencias, Encadenamiento y Contrafactuales
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  TreeNode,
  ConsequenceTree,
  SimulationMonthState,
  NodeMetrics,
  NodeDelta,
  TriggeredEvent,
} from "../types/index.js";
import { runSingleSimulation } from "../engine/simulate.js";

/**
 * Crea las métricas resumidas a partir de un snapshot mensual.
 */
function extractMetrics(
  snapshot: SimulationMonthState,
  accumulatedProfit: number,
  negativeEventsCount: number
): NodeMetrics {
  return {
    beneficioAcumulado: accumulatedProfit,
    beneficioMes: snapshot.beneficio,
    caja: snapshot.caja,
    clientes: snapshot.atendidos,
    satisfaccion: snapshot.satisfaccion,
    reputacion: snapshot.reputacion,
    eventosNegativos: negativeEventsCount,
  };
}

/**
 * Crea el snapshot de mes cero (estado inicial del negocio).
 */
export function createInitialSnapshot(
  profile: NormalizedProfile
): SimulationMonthState {
  const d = profile.derivatives;
  return {
    t: 0,
    demanda: profile.clientesPorMes,
    capacidad: profile.capacidadMaximaMes,
    atendidos: profile.clientesPorMes,
    exceso: 0,
    ticket: profile.ticketPromedio,
    satisfaccion: profile.satisfaccionBase,
    reputacion: profile.reputacionBase,
    ingresos: d.ingresos,
    costoVariable: d.costosVariables,
    costosFijos: profile.costosFijosMensuales,
    marketing: profile.marketingMensual,
    deuda: profile.cuotasDeudaMensuales,
    oneTimeCost: 0,
    beneficio: d.beneficioMensual,
    caja: profile.cajaDisponible,
    activeEvents: [],
  };
}

/**
 * Inicializa un nuevo árbol de consecuencias con su nodo raíz.
 */
export function createInitialTree(profile: NormalizedProfile): ConsequenceTree {
  const rootSnapshot = createInitialSnapshot(profile);
  const rootMetrics = extractMetrics(rootSnapshot, 0, 0);

  const rootNode: TreeNode = {
    id: "root",
    parentId: null,
    type: "raiz",
    stateSnapshot: rootSnapshot,
    events: [],
    metrics: rootMetrics,
    childrenIds: [],
    depth: 0,
  };

  return {
    id: `tree_${Date.now()}`,
    rootId: "root",
    activeNodeId: "root",
    nodes: {
      root: rootNode,
    },
  };
}

/**
 * Genera un nuevo perfil derivado a partir del snapshot de un nodo de resultado,
 * permitiendo encadenar decisiones posteriores.
 */
export function deriveProfileFromSnapshot(
  baseProfile: NormalizedProfile,
  snapshot: SimulationMonthState
): NormalizedProfile {
  return {
    ...baseProfile,
    clientesPorMes: snapshot.atendidos,
    ticketPromedio: snapshot.ticket,
    cajaDisponible: snapshot.caja,
    satisfaccionBase: snapshot.satisfaccion,
    reputacionBase: snapshot.reputacion,
    costosFijosMensuales: snapshot.costosFijos,
    marketingMensual: snapshot.marketing,
    cuotasDeudaMensuales: snapshot.deuda,
    derivatives: {
      ...baseProfile.derivatives,
      ingresos: snapshot.ingresos,
      costosVariables: snapshot.costoVariable,
      beneficioMensual: snapshot.beneficio,
      utilizacion:
        snapshot.capacidad > 0 ? snapshot.atendidos / snapshot.capacidad : 1,
    },
  };
}

/**
 * Agrega una rama de decisión al árbol desde cualquier nodo (raíz o resultado previo).
 * Regla: Profundidad máxima del MVP = 3 decisiones encadenadas.
 */
export function addDecisionBranch(
  tree: ConsequenceTree,
  parentNodeId: string,
  decision: Decision,
  baseProfile: NormalizedProfile
): { updatedTree: ConsequenceTree; decisionNodeId: string } {
  const parentNode = tree.nodes[parentNodeId];
  if (!parentNode) {
    throw new Error(`Nodo padre no encontrado: ${parentNodeId}`);
  }

  // Comprobar límite de profundidad (máx 3 niveles de decisiones)
  if (parentNode.depth >= 3) {
    throw new Error("Límite de profundidad alcanzado (máximo 3 decisiones encadenadas en MVP)");
  }

  // Generar perfil de partida según el snapshot del nodo padre
  const startingProfile =
    parentNode.type === "raiz"
      ? baseProfile
      : deriveProfileFromSnapshot(baseProfile, parentNode.stateSnapshot);

  const horizon = baseProfile.horizonte;
  // Simular desde el estado padre
  const simulation = runSingleSimulation(
    startingProfile,
    decision,
    horizon,
    "base",
    parentNode.stateSnapshot
  );

  const newNodes = { ...tree.nodes };
  const decisionNodeId = `dec_${decision.id}_${Date.now()}`;
  const isChained = parentNode.type !== "raiz";

  // Nodo de decisión (o seguimiento si viene de un resultado)
  const decisionNode: TreeNode = {
    id: decisionNodeId,
    parentId: parentNodeId,
    type: isChained ? "seguimiento" : "decision",
    decisionId: decision.id,
    decisionName: decision.name,
    stateSnapshot: parentNode.stateSnapshot,
    events: [],
    metrics: parentNode.metrics,
    childrenIds: [],
    depth: parentNode.depth + 1,
  };
  newNodes[decisionNodeId] = decisionNode;

  // Actualizar hijos del nodo padre
  newNodes[parentNodeId] = {
    ...parentNode,
    childrenIds: [...parentNode.childrenIds, decisionNodeId],
  };

  // Horizontes a registrar en el árbol: corto (1), mediano (6), largo (12 o 24)
  const horizonsToTrack: (1 | 6 | 12 | 24)[] = [1, 6, 12];
  if (horizon === 24) {
    horizonsToTrack.push(24);
  }

  let previousNodeId = decisionNodeId;

  for (const h of horizonsToTrack) {
    const monthIndex = Math.min(h, simulation.months.length) - 1;
    const snapshotAtH = simulation.months[monthIndex];

    // Eventos disparados hasta este horizonte
    const eventsUntilH = simulation.triggeredEvents.filter(
      (e) => e.triggeredAtMonth <= h
    );
    const negativeEvents = eventsUntilH.filter((e) => e.severity === "alta").length;

    // Calcular beneficio acumulado hasta el mes h
    const cumProfit = Number(
      simulation.months
        .slice(0, monthIndex + 1)
        .reduce((sum, m) => sum + m.beneficio, 0)
        .toFixed(2)
    );

    const metricsAtH = extractMetrics(snapshotAtH, cumProfit, negativeEvents);

    // Delta respecto al nodo padre
    const deltaVsParent: NodeDelta = {
      beneficioDeltaVsParent:
        metricsAtH.beneficioAcumulado - parentNode.metrics.beneficioAcumulado,
      cajaDeltaVsParent: metricsAtH.caja - parentNode.metrics.caja,
      clientesDeltaVsParent: metricsAtH.clientes - parentNode.metrics.clientes,
      satisfaccionDeltaVsParent:
        metricsAtH.satisfaccion - parentNode.metrics.satisfaccion,
    };

    // Eventos en este tramo (máximo 2 por horizonte priorizados por severidad)
    const eventsInSpan = simulation.triggeredEvents
      .filter((e) => {
        const prevH = h === 1 ? 0 : h === 6 ? 1 : 6;
        return e.triggeredAtMonth > prevH && e.triggeredAtMonth <= h;
      })
      .sort((a, b) => (a.severity === "alta" ? -1 : 1))
      .slice(0, 2);

    // Si hay eventos significativos, insertar nodo evento intermedio
    let parentForResultado = previousNodeId;
    if (eventsInSpan.length > 0) {
      const eventNodeId = `event_h${h}_${decision.id}_${Date.now()}`;
      const eventNode: TreeNode = {
        id: eventNodeId,
        parentId: previousNodeId,
        type: "evento",
        decisionId: decision.id,
        decisionName: decision.name,
        stateSnapshot: snapshotAtH,
        events: eventsInSpan,
        metrics: metricsAtH,
        childrenIds: [],
        depth: decisionNode.depth,
      };
      newNodes[eventNodeId] = eventNode;
      newNodes[previousNodeId] = {
        ...newNodes[previousNodeId],
        childrenIds: [...newNodes[previousNodeId].childrenIds, eventNodeId],
      };
      parentForResultado = eventNodeId;
    }

    const resultadoNodeId = `res_h${h}_${decision.id}_${Date.now()}`;
    const resultadoNode: TreeNode = {
      id: resultadoNodeId,
      parentId: parentForResultado,
      type: "resultado",
      horizon: h,
      decisionId: decision.id,
      decisionName: decision.name,
      stateSnapshot: snapshotAtH,
      deltaVsParent,
      events: eventsUntilH,
      metrics: metricsAtH,
      childrenIds: [],
      depth: decisionNode.depth,
    };

    newNodes[resultadoNodeId] = resultadoNode;
    newNodes[parentForResultado] = {
      ...newNodes[parentForResultado],
      childrenIds: [...newNodes[parentForResultado].childrenIds, resultadoNodeId],
    };

    previousNodeId = resultadoNodeId;
  }

  const updatedTree: ConsequenceTree = {
    ...tree,
    nodes: newNodes,
    activeNodeId: decisionNodeId,
  };

  return { updatedTree, decisionNodeId };
}

/**
 * Cambia el nodo activo del árbol preservando intactas todas las ramas hermanas.
 */
export function setActiveNode(
  tree: ConsequenceTree,
  nodeId: string
): ConsequenceTree {
  if (!tree.nodes[nodeId]) {
    throw new Error(`El nodo ${nodeId} no existe en el árbol`);
  }
  return {
    ...tree,
    activeNodeId: nodeId,
  };
}

/**
 * Simulación contrafactual ("¿Qué habría pasado si...?"):
 * Se re-simula directamente desde el nodo ancestro con otra decisión sin alterar
 * ni borrar las ramas existentes.
 */
export function simulateCounterfactual(
  tree: ConsequenceTree,
  ancestorNodeId: string,
  alternativeDecision: Decision,
  baseProfile: NormalizedProfile
): { updatedTree: ConsequenceTree; decisionNodeId: string } {
  return addDecisionBranch(
    tree,
    ancestorNodeId,
    alternativeDecision,
    baseProfile
  );
}

export interface PathwayItem {
  step: number;
  decision: Decision;
  profileBefore: NormalizedProfile;
  profileAfter: NormalizedProfile;
  simResult: any;
}

/**
 * Construye el árbol de consecuencias encadenando estrictamente las decisiones
 * elegidas por el usuario en cada ronda (Paso 1 -> Paso 2 -> Paso 3), evitando
 * repeticiones innecesarias de la misma decisión.
 */
export function buildPathwayTree(
  initialProfile: NormalizedProfile,
  pathHistory: PathwayItem[],
  currentPreview?: {
    step: number;
    decision: Decision;
    simResult: any;
  } | null,
  isCompleted: boolean = false
): ConsequenceTree {
  const rootSnapshot = createInitialSnapshot(initialProfile);
  const rootMetrics = extractMetrics(rootSnapshot, 0, 0);

  const rootNode: TreeNode = {
    id: "root",
    parentId: null,
    type: "raiz",
    stateSnapshot: rootSnapshot,
    events: [],
    metrics: rootMetrics,
    childrenIds: [],
    depth: 0,
  };

  const nodes: Record<string, TreeNode> = {
    root: rootNode,
  };

  let currentParentId = "root";
  let prevMetrics = rootMetrics;
  let prevSnapshot = rootSnapshot;

  for (const item of pathHistory) {
    const decNodeId = `dec_step_${item.step}`;
    const resNodeId = `res_step_${item.step}`;

    nodes[currentParentId] = {
      ...nodes[currentParentId],
      childrenIds: [...nodes[currentParentId].childrenIds, decNodeId],
    };

    const decNode: TreeNode = {
      id: decNodeId,
      parentId: currentParentId,
      type: item.step === 1 ? "decision" : "seguimiento",
      decisionId: item.decision.id,
      decisionName: item.decision.name,
      stateSnapshot: prevSnapshot,
      events: [],
      metrics: prevMetrics,
      childrenIds: [resNodeId],
      depth: item.step,
    };
    nodes[decNodeId] = decNode;

    const months = item.simResult?.base?.months || [];
    const cycleMonths = Math.max(1, Math.round(initialProfile.horizonte / 3));
    const targetIdx = Math.min(cycleMonths - 1, months.length - 1);
    const snapshotAtTarget = targetIdx >= 0 && months[targetIdx]
      ? months[targetIdx]
      : createInitialSnapshot(item.profileAfter);

    const cumProfit = Number(
      months
        .slice(0, targetIdx + 1)
        .reduce((sum: number, m: any) => sum + (m.beneficio || 0), 0)
        .toFixed(2)
    );
    const negEvents = (snapshotAtTarget.activeEvents || []).length;
    const metricsAtStep = extractMetrics(snapshotAtTarget, cumProfit, negEvents);

    const deltaVsParent: NodeDelta = {
      beneficioDeltaVsParent: metricsAtStep.beneficioAcumulado - prevMetrics.beneficioAcumulado,
      cajaDeltaVsParent: metricsAtStep.caja - prevMetrics.caja,
      clientesDeltaVsParent: metricsAtStep.clientes - prevMetrics.clientes,
      satisfaccionDeltaVsParent: metricsAtStep.satisfaccion - prevMetrics.satisfaccion,
    };

    const resNode: TreeNode = {
      id: resNodeId,
      parentId: decNodeId,
      type: "resultado",
      horizon: (item.step === 1 ? 1 : item.step === 2 ? 6 : 12) as 1 | 6 | 12 | 24,
      decisionId: item.decision.id,
      decisionName: item.decision.name,
      stateSnapshot: snapshotAtTarget,
      deltaVsParent,
      events: snapshotAtTarget.activeEvents || [],
      metrics: metricsAtStep,
      childrenIds: [],
      depth: item.step,
    };
    nodes[resNodeId] = resNode;

    currentParentId = resNodeId;
    prevMetrics = metricsAtStep;
    prevSnapshot = snapshotAtTarget;
  }

  if (!isCompleted && currentPreview && currentPreview.decision && currentPreview.step > pathHistory.length) {
    const previewDecId = `dec_preview_${currentPreview.step}`;
    const previewResId = `res_preview_${currentPreview.step}`;

    nodes[currentParentId] = {
      ...nodes[currentParentId],
      childrenIds: [...nodes[currentParentId].childrenIds, previewDecId],
    };

    const previewDecNode: TreeNode = {
      id: previewDecId,
      parentId: currentParentId,
      type: currentPreview.step === 1 ? "decision" : "seguimiento",
      decisionId: currentPreview.decision.id,
      decisionName: currentPreview.decision.name,
      stateSnapshot: prevSnapshot,
      events: [],
      metrics: prevMetrics,
      childrenIds: [previewResId],
      depth: currentPreview.step,
    };
    nodes[previewDecId] = previewDecNode;

    const previewMonths = currentPreview.simResult?.base?.months || [];
    const cycleMonths = Math.max(1, Math.round(initialProfile.horizonte / 3));
    const targetIdx = Math.min(cycleMonths - 1, previewMonths.length - 1);
    const previewSnapshot = targetIdx >= 0 && previewMonths[targetIdx]
      ? previewMonths[targetIdx]
      : prevSnapshot;

    const cumProfit = Number(
      previewMonths
        .slice(0, targetIdx + 1)
        .reduce((sum: number, m: any) => sum + (m.beneficio || 0), 0)
        .toFixed(2)
    );
    const negEvents = (previewSnapshot.activeEvents || []).length;
    const previewMetrics = extractMetrics(previewSnapshot, cumProfit, negEvents);

    const previewDelta: NodeDelta = {
      beneficioDeltaVsParent: previewMetrics.beneficioAcumulado - prevMetrics.beneficioAcumulado,
      cajaDeltaVsParent: previewMetrics.caja - prevMetrics.caja,
      clientesDeltaVsParent: previewMetrics.clientes - prevMetrics.clientes,
      satisfaccionDeltaVsParent: previewMetrics.satisfaccion - prevMetrics.satisfaccion,
    };

    const previewResNode: TreeNode = {
      id: previewResId,
      parentId: previewDecId,
      type: "resultado",
      horizon: (currentPreview.step === 1 ? 1 : currentPreview.step === 2 ? 6 : 12) as 1 | 6 | 12 | 24,
      decisionId: currentPreview.decision.id,
      decisionName: currentPreview.decision.name,
      stateSnapshot: previewSnapshot,
      deltaVsParent: previewDelta,
      events: previewSnapshot.activeEvents || [],
      metrics: previewMetrics,
      childrenIds: [],
      depth: currentPreview.step,
    };
    nodes[previewResId] = previewResNode;

    currentParentId = previewResId;
  }

  return {
    id: `tree_${Date.now()}`,
    rootId: "root",
    activeNodeId: currentParentId,
    nodes,
  };
}
