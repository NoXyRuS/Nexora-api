// ============================================================================
// Generación de Prompt y Validación de Decisiones Propuestas por IA
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  DiagnosticLabel,
  DecisionCategory,
} from "../types/index.js";
import { getFallbackDecisions } from "./fallbacks.js";

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface DecisionPromptInput {
  profile: NormalizedProfile;
  diagnosis: DiagnosticLabel[];
}

export const SYSTEM_PROMPT_DECISIONS = `Eres un consultor de negocios. Recibes el perfil de un negocio, su diagnóstico y su objetivo. Propone entre 5 y 7 decisiones estratégicas distintas, como parámetros numéricos dentro de los rangos del esquema. Reglas: (1) al menos una decisión ataca directamente el problema principal; (2) incluye variedad de categorías, una de bajo costo, una de alto riesgo y alto potencial y una poco obvia; (3) respeta las restricciones del usuario; (4) cada decisión debe tener ventajas, desventajas y riesgos reales; (5) NUNCA calcules ni menciones resultados (ventas, beneficios, clientes futuros); solo parámetros; (6) justifica cada parámetro importante en assumptions con su nivel de confianza; (7) responde solo JSON válido, sin texto adicional.`;

/**
 * Construye el prompt de sistema y de usuario para solicitar decisiones a la IA.
 */
export function buildDecisionPrompt(input: DecisionPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { profile, diagnosis } = input;
  const d = profile.derivatives;

  const userPrompt = JSON.stringify(
    {
      perfil: {
        rubro: profile.rubro,
        tipoOferta: profile.tipoOferta,
        moneda: profile.moneda,
        descripcion: profile.descripcionLibre,
        clientesPorMes: profile.clientesPorMes,
        ticketPromedio: profile.ticketPromedio,
        tendencia: profile.tendenciaUltimos3Meses,
        costoVariablePct: profile.costoVariablePct,
        costosFijosMensuales: profile.costosFijosMensuales,
        marketingMensual: profile.marketingMensual,
        cuotasDeuda: profile.cuotasDeudaMensuales,
        capacidadMaxima: profile.capacidadMaximaMes,
        empleados: profile.numeroEmpleados,
        competencia: profile.nivelCompetencia,
        cajaDisponible: profile.cajaDisponible,
        satisfaccionBase: profile.satisfaccionBase,
      },
      derivados: {
        ingresos: d.ingresos,
        costosVariables: d.costosVariables,
        beneficioMensual: d.beneficioMensual,
        margenPct: d.margenPct,
        utilizacion: d.utilizacion,
        puntoEquilibrio: d.puntoEquilibrioClientes,
        runway: d.runwayMeses,
      },
      diagnostico: diagnosis.map((diag) => ({
        codigo: diag.code,
        severidad: diag.severity,
        mensaje: diag.message,
      })),
      objetivos: {
        problemaPrincipal: profile.problemaPrincipal,
        objetivoPrioritario: profile.objetivoPrioritario,
        restricciones: profile.restricciones,
        horizonteMeses: profile.horizonte,
      },
      esquemaEsperado:
        "Array de Decision: { id, name, category, description, oneTimeCost, fixedDelta, marketingDelta, priceChangePct, varCostDeltaPct, capacityChangePct, demandLift: { start, end, curve, lagMonths }, satisfactionPerMonth, pros: [], cons: [], risks: [], assumptions: [{ text, confidence: 'baja'|'media'|'alta' }], requiresFinancing: boolean }",
    },
    null,
    2
  );

  return {
    systemPrompt: SYSTEM_PROMPT_DECISIONS,
    userPrompt,
  };
}

/**
 * Valida, recorta (clamp) y sanea las decisiones devueltas por la IA.
 * Descarta duplicados o decisiones que violen restricciones explícitas del usuario.
 * Si oneTimeCost > caja, marca requiresFinancing = true sin descartar.
 * Garantiza un mínimo de 4 decisiones válidas completando con respaldos si es necesario.
 */
export function validateAndSanitizeDecisions(
  rawDecisions: unknown,
  profile: NormalizedProfile
): {
  validDecisions: Decision[];
  discardedReasons: string[];
  requiredSupplement: boolean;
} {
  const discardedReasons: string[] = [];
  const validDecisions: Decision[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  if (!Array.isArray(rawDecisions)) {
    return {
      validDecisions: getFallbackDecisions(profile.rubro),
      discardedReasons: ["La respuesta no es un arreglo JSON válido"],
      requiredSupplement: true,
    };
  }

  const validCategories: DecisionCategory[] = [
    "marketing",
    "precio",
    "operaciones",
    "personal",
    "producto",
    "fidelizacion",
    "costos",
    "inversion",
  ];

  for (const item of rawDecisions) {
    if (!item || typeof item !== "object") {
      discardedReasons.push("Elemento de decisión no es un objeto");
      continue;
    }

    const d = item as Partial<Decision>;

    if (!d.id || typeof d.id !== "string" || !d.name || typeof d.name !== "string") {
      discardedReasons.push("Decisión sin ID o nombre válido");
      continue;
    }

    // Descartar duplicados
    const normalizedName = d.name.trim().toLowerCase();
    if (seenIds.has(d.id) || seenNames.has(normalizedName)) {
      discardedReasons.push(`Decisión duplicada: ${d.name}`);
      continue;
    }

    // Categoría
    const category: DecisionCategory =
      d.category && validCategories.includes(d.category)
        ? d.category
        : "operaciones";

    // Clamping estricto a los rangos permitidos por el esquema
    const priceChangePct = clamp(Number(d.priceChangePct ?? 0), -40, 40);
    const varCostDeltaPct = clamp(Number(d.varCostDeltaPct ?? 0), -20, 20);
    const capacityChangePct = clamp(Number(d.capacityChangePct ?? 0), -50, 100);
    const satisfactionPerMonth = clamp(
      Number(d.satisfactionPerMonth ?? 0),
      -3,
      3
    );
    const oneTimeCost = Math.max(0, Number(d.oneTimeCost ?? 0));
    const fixedDelta = Number(d.fixedDelta ?? 0);
    const marketingDelta = Number(d.marketingDelta ?? 0);

    // Demand lift clamping
    const liftRaw = d.demandLift ?? {
      start: 0,
      end: 0,
      curve: "linear",
      lagMonths: 0,
    };
    const demandLift = {
      start: clamp(Number(liftRaw.start ?? 0), -50, 200),
      end: clamp(Number(liftRaw.end ?? 0), -50, 200),
      curve: liftRaw.curve === "pulse" ? ("pulse" as const) : ("linear" as const),
      lagMonths: Math.max(0, Math.round(Number(liftRaw.lagMonths ?? 0))),
    };

    // 2. Verificar restricciones explícitas del usuario
    let violatesRestriction = false;
    for (const restr of profile.restricciones) {
      const rLower = restr.toLowerCase();

      // Restricción: "no bajar precios"
      if (rLower.includes("no bajar precio") && priceChangePct < 0) {
        discardedReasons.push(
          `Decisión «${d.name}» descartada: viola restricción de no bajar precios (${priceChangePct}%)`
        );
        violatesRestriction = true;
        break;
      }

      // Restricción: "no despedir"
      if (
        rLower.includes("no despedir") &&
        (category === "personal" && fixedDelta < 0)
      ) {
        discardedReasons.push(
          `Decisión «${d.name}» descartada: viola restricción de no despedir personal`
        );
        violatesRestriction = true;
        break;
      }

      // Restricción: "inversión máxima: X"
      if (rLower.includes("inversion") || rLower.includes("inversión")) {
        const match = rLower.match(/(\d+[\d,.]*)/);
        if (match) {
          const maxInv = parseFloat(match[1].replace(/,/g, ""));
          if (!isNaN(maxInv) && oneTimeCost > maxInv) {
            discardedReasons.push(
              `Decisión «${d.name}» descartada: costo inicial (${oneTimeCost}) supera inversión máxima (${maxInv})`
            );
            violatesRestriction = true;
            break;
          }
        }
      }
    }

    if (violatesRestriction) {
      continue;
    }

    // 3. Regla de financiamiento: Si oneTimeCost supera la caja, marcar requiresFinancing = true
    const requiresFinancing =
      oneTimeCost > profile.cajaDisponible || Boolean(d.requiresFinancing);

    // Listas y supuestos
    const pros = Array.isArray(d.pros) && d.pros.length > 0 ? d.pros : ["Sin pros especificados"];
    const cons = Array.isArray(d.cons) && d.cons.length > 0 ? d.cons : ["Sin contras especificados"];
    const risks = Array.isArray(d.risks) && d.risks.length > 0 ? d.risks : ["Riesgo operacional general"];

    const assumptions =
      Array.isArray(d.assumptions) && d.assumptions.length > 0
        ? d.assumptions.map((a) => ({
            text: String(a.text ?? "Supuesto operativo"),
            confidence:
              a.confidence === "alta" || a.confidence === "baja"
                ? a.confidence
                : ("media" as const),
          }))
        : [{ text: "Supuesto general de mercado", confidence: "media" as const }];

    const sanitizedDecision: Decision = {
      id: d.id,
      name: d.name.trim(),
      category,
      description: d.description?.trim() ?? "Sin descripción",
      oneTimeCost,
      fixedDelta,
      marketingDelta,
      priceChangePct,
      varCostDeltaPct,
      capacityChangePct,
      demandLift,
      satisfactionPerMonth,
      pros,
      cons,
      risks,
      assumptions,
      requiresFinancing,
    };

    validDecisions.push(sanitizedDecision);
    seenIds.add(sanitizedDecision.id);
    seenNames.add(normalizedName);
  }

  // 5. Exigir mínimo 4 decisiones válidas. Si hay menos, complementar con respaldos.
  let requiredSupplement = false;
  if (validDecisions.length < 4) {
    requiredSupplement = true;
    const fallbacks = getFallbackDecisions(profile.rubro);
    for (const fb of fallbacks) {
      if (
        !seenIds.has(fb.id) &&
        !seenNames.has(fb.name.trim().toLowerCase()) &&
        validDecisions.length < 5
      ) {
        validDecisions.push(fb);
        seenIds.add(fb.id);
        seenNames.add(fb.name.trim().toLowerCase());
      }
    }
  }

  return {
    validDecisions,
    discardedReasons,
    requiredSupplement,
  };
}

/**
 * Procesa la respuesta de la IA (manejando fallos de parseo con reintento o respaldo).
 */
export function processAiDecisionsResponse(
  rawJson: string,
  profile: NormalizedProfile
): { decisions: Decision[]; usedFallback: boolean } {
  try {
    const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    const candidateList = Array.isArray(parsed)
      ? parsed
      : (parsed?.decisions ?? parsed?.data ?? parsed?.decisiones ?? Object.values(parsed ?? {}).find(Array.isArray) ?? []);
    const { validDecisions, requiredSupplement } = validateAndSanitizeDecisions(
      candidateList,
      profile
    );
    return {
      decisions: validDecisions,
      usedFallback: requiredSupplement,
    };
  } catch {
    // Si el JSON es inválido, usar directamente decisiones predefinidas por rubro
    return {
      decisions: getFallbackDecisions(profile.rubro),
      usedFallback: true,
    };
  }
}
