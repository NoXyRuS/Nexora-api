// ============================================================================
// Generación de Prompt B, Explicación y Verificador Estricto de Cifras
// ============================================================================

import {
  NormalizedProfile,
  SimulationResult,
  ExplanationOutput,
} from "../types/index.js";
import { generateTemplateExplanation } from "./fallbacks.js";

export const SYSTEM_PROMPT_EXPLAIN = `Eres un analista de negocios. Explicas resultados de una simulación en lenguaje claro para personas sin formación en administración. Usa SOLO las cifras que aparecen en el JSON recibido. No calcules, no estimes ni inventes números. Distingue entre resultados del motor y supuestos del escenario, y menciona las hipótesis de baja confianza. Explica la cadena causal (decisión → efecto directo → efecto indirecto). Señala al menos un riesgo que el usuario podría no haber considerado. Si la pregunta del usuario requiere un escenario nuevo, no lo estimes: devuelve los parámetros de una decisión para que el motor la simule.`;

/**
 * Extrae recursivamente todos los números contenidos en un objeto o JSON del motor.
 */
export function extractNumbersFromObject(obj: unknown): number[] {
  const numbers: number[] = [];

  function recurse(val: unknown) {
    if (typeof val === "number" && !isNaN(val)) {
      numbers.push(Number(val.toFixed(2)));
    } else if (Array.isArray(val)) {
      for (const item of val) recurse(item);
    } else if (val && typeof val === "object") {
      for (const key of Object.keys(val)) {
        recurse((val as Record<string, unknown>)[key]);
      }
    }
  }

  recurse(obj);
  return numbers;
}

/**
 * Extrae todos los números representados en una cadena de texto.
 */
export function extractNumbersFromText(text: string): number[] {
  // Regex para números enteros y decimales con . o ,
  // Evita códigos alfanuméricos como id_123
  const regex = /(?:^|\s|[$,(])([+-]?\d+(?:[.,]\d+)?)(?=%|\b|\s|[$,).])/g;
  const matches = text.match(regex);
  if (!matches) return [];

  const nums: number[] = [];
  for (const m of matches) {
    const cleaned = m.trim().replace(/[$%,()]/g, "").replace(",", ".");
    const val = parseFloat(cleaned);
    if (!isNaN(val)) {
      nums.push(Number(val.toFixed(2)));
    }
  }
  return nums;
}

/**
 * Verificador de Cifras (Fact-Checker):
 * Comprueba que cada número presente en el texto de la IA exista en el JSON del motor
 * con una tolerancia de redondeo (±1 o ±1%).
 */
export function verifyExplanationNumbers(
  text: string,
  engineData: unknown,
  allowedExtraNumbers: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 24] // Meses u ordinales de horizonte
): { isValid: boolean; unverifiedNumbers: number[]; verifiedNumbers: number[] } {
  const textNumbers = extractNumbersFromText(text);
  const engineNumbers = extractNumbersFromObject(engineData);
  const allowedSet = new Set<number>([
    ...engineNumbers,
    ...allowedExtraNumbers,
  ]);

  const unverifiedNumbers: number[] = [];
  const verifiedNumbers: number[] = [];

  for (const num of textNumbers) {
    const absNum = Math.abs(num);
    // Verificar coincidencia exacta o con tolerancia de redondeo de 1 unidad o 1%
    const found = Array.from(allowedSet).some((allowed) => {
      const absAllowed = Math.abs(allowed);
      if (Math.abs(absNum - absAllowed) <= 1.01) return true;
      if (absAllowed > 0 && Math.abs(absNum - absAllowed) / absAllowed <= 0.01) {
        return true;
      }
      return false;
    });

    if (found) {
      verifiedNumbers.push(num);
    } else {
      unverifiedNumbers.push(num);
    }
  }

  return {
    isValid: unverifiedNumbers.length === 0,
    unverifiedNumbers,
    verifiedNumbers,
  };
}

/**
 * Construye el prompt para la explicación de resultados.
 */
export function buildExplanationPrompt(
  simResult: SimulationResult,
  profile: NormalizedProfile,
  userQuestion?: string
): { systemPrompt: string; userPrompt: string } {
  const inputData = {
    decisionName: simResult.decisionName,
    horizonte: simResult.horizon,
    moneda: profile.moneda,
    resumenMotor: simResult.base.summary,
    eventosDisparados: simResult.base.triggeredEvents,
    supuestosEscenario: profile.assumptions,
    preguntaUsuario: userQuestion ?? "Explica las consecuencias principales de este camino.",
  };

  return {
    systemPrompt: SYSTEM_PROMPT_EXPLAIN,
    userPrompt: JSON.stringify(inputData, null, 2),
  };
}

/**
 * Procesa la respuesta de la IA verificando sus cifras.
 * Si detecta números inventados que no provienen del motor, recurre a la plantilla determinista.
 */
export function processAiExplanationResponse(
  aiGeneratedText: string,
  simResult: SimulationResult,
  profile: NormalizedProfile
): ExplanationOutput {
  const engineData = {
    summary: simResult.base.summary,
    events: simResult.base.triggeredEvents,
    horizon: simResult.horizon,
    profileSatisfaccion: profile.satisfaccionBase,
    profileReputacion: profile.reputacionBase,
  };

  const check = verifyExplanationNumbers(aiGeneratedText, engineData);

  if (!check.isValid) {
    // Si contiene cifras inventadas, se descarta y se usa la plantilla determinista
    return generateTemplateExplanation(simResult, profile);
  }

  // Parsear texto en componentes estructurados
  return {
    cadenaCausal: aiGeneratedText,
    riesgosNoConsiderados: [
      "Riesgo operacional general asociado a la ejecución puntual",
    ],
    recomendacion: "Monitorear trimestralmente la respuesta de los clientes",
    numerosAuditados: check.verifiedNumbers,
    esPlantillaRespaldo: false,
  };
}
