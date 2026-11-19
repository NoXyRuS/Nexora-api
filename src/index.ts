// ============================================================================
// Núcleo Lógico «Efecto Mariposa» (Módulos Puros en TypeScript)
// ============================================================================

// Tipos
export * from "./types/index.js";

// 1. Formulario y Validación
export { validateCaseForm } from "./form/validate.js";

// 2. Perfil y Derivados
export {
  normalizeProfile,
  calculateDerivatives,
  scale1To5To100,
} from "./profile/normalize.js";

// 3. Diagnóstico por Reglas
export { runRuleBasedDiagnosis } from "./diagnosis/rules.js";

// 4. Catálogo de Eventos de Segundo Orden
export {
  evaluateSecondOrderEvents,
  type EventEvaluationContext,
} from "./engine/events.js";

// 5. Motor de Simulación Determinista
export {
  simulateDecision,
  runSingleSimulation,
  getElasticityByCompetition,
  calculateDemandLift,
  getSeasonalityFactor,
} from "./engine/simulate.js";

// 6. Árbol de Consecuencias, Encadenamiento y Contrafactuales
export {
  createInitialTree,
  createInitialSnapshot,
  deriveProfileFromSnapshot,
  addDecisionBranch,
  setActiveNode,
  simulateCounterfactual,
} from "./tree/build.js";

// 7. Comparación de Caminos, Punto de Divergencia y Ranking
export {
  comparePaths,
  findDivergencePoint,
  getWeightsForObjective,
} from "./compare/metrics.js";

// 8. Integración con IA, Validaciones, Clamping y Verificador de Cifras
export {
  buildDecisionPrompt,
  validateAndSanitizeDecisions,
  processAiDecisionsResponse,
  SYSTEM_PROMPT_DECISIONS,
} from "./ai/decisions.js";

export {
  buildExplanationPrompt,
  verifyExplanationNumbers,
  processAiExplanationResponse,
  extractNumbersFromText,
  extractNumbersFromObject,
  SYSTEM_PROMPT_EXPLAIN,
} from "./ai/explain.js";

export {
  FALLBACK_DECISIONS_BY_RUBRO,
  getFallbackDecisions,
  generateTemplateExplanation,
} from "./ai/fallbacks.js";

// 9. Persistencia de Sesión Versionada
export {
  serializeSession,
  deserializeSession,
  createNewSession,
  SESSION_SCHEMA_VERSION,
  type SessionState,
} from "./session/serialize.js";
