// ============================================================================
// Núcleo Lógico «Efecto Mariposa» - Definición de Tipos
// ============================================================================

export type Rubro =
  | "comercio"
  | "gastronomia"
  | "servicios"
  | "manufactura"
  | "educacion"
  | "otro";

export type TipoOferta = "producto" | "servicio" | "mixto";

export type TendenciaTipo = "cayendo" | "estable" | "creciendo";

export type Estacionalidad = "ninguna" | "leve" | "fuerte";

export type NivelCompetencia = "baja" | "media" | "alta";

export type ObjetivoPrioritario =
  | "rentabilidad"
  | "crecimiento"
  | "estabilidad"
  | "reducir_riesgo";

export interface DesgloseCostosFijos {
  personal?: number;
  alquiler?: number;
  servicios?: number;
  otros?: number;
}

export interface ProblemaPrincipal {
  categoria: string;
  descripcion: string;
}

export interface TendenciaInput {
  tipo: TendenciaTipo;
  porcentaje: number; // e.g. 5 para 5%
}

export interface CaseFormInput {
  // A. Negocio
  rubro: Rubro;
  tipoOferta: TipoOferta;
  moneda: string;
  descripcionLibre?: string;

  // B. Ventas
  clientesPorMes: number;
  ticketPromedio: number;
  tendenciaUltimos3Meses: TendenciaInput;
  estacionalidad?: Estacionalidad;

  // C. Costos
  costoVariablePct: number; // 0 - 100
  costosFijosMensuales: number;
  desgloseCostosFijos?: DesgloseCostosFijos;
  marketingMensual: number;
  cuotasDeudaMensuales?: number;

  // D. Capacidad
  capacidadMaximaMes: number;
  numeroEmpleados: number;

  // E. Contexto
  nivelCompetencia: NivelCompetencia;
  cajaDisponible: number;
  satisfaccionClientes?: number; // 1 a 5
  reputacion?: number; // 1 a 5

  // F. Objetivos
  problemaPrincipal: ProblemaPrincipal;
  objetivoPrioritario: ObjetivoPrioritario;
  restricciones?: string[];
  horizonte: 12 | 24;
}

export interface Assumption {
  id: string;
  field: string;
  value: unknown;
  reason: string;
  origin: "default" | "user" | "derived";
  confidence?: "baja" | "media" | "alta";
}

export interface ProfileDerivatives {
  ingresos: number;
  costosVariables: number;
  costosTotales: number;
  beneficioMensual: number;
  margenPct: number;
  utilizacion: number; // clientes / capacidad
  puntoEquilibrioClientes: number;
  runwayMeses: number | null; // solo si beneficio < 0
  tendenciaMensualPct: number;
}

export interface NormalizedProfile {
  raw: CaseFormInput;
  // Valores normalizados
  rubro: Rubro;
  tipoOferta: TipoOferta;
  moneda: string;
  descripcionLibre: string;

  clientesPorMes: number;
  ticketPromedio: number;
  tendenciaUltimos3Meses: TendenciaInput;
  estacionalidad: Estacionalidad;

  costoVariablePct: number;
  costosFijosMensuales: number;
  desgloseCostosFijos: DesgloseCostosFijos;
  marketingMensual: number;
  cuotasDeudaMensuales: number;

  capacidadMaximaMes: number;
  numeroEmpleados: number;

  nivelCompetencia: NivelCompetencia;
  cajaDisponible: number;
  satisfaccionBase: number; // escala 0 - 100
  reputacionBase: number; // escala 0 - 100

  problemaPrincipal: ProblemaPrincipal;
  objetivoPrioritario: ObjetivoPrioritario;
  restricciones: string[];
  horizonte: 12 | 24;

  derivatives: ProfileDerivatives;
  assumptions: Assumption[];
  isConfirmed: boolean;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  assumptions: Assumption[];
  profile?: NormalizedProfile;
}

// ----------------------------------------------------------------------------
// Diagnóstico por Reglas
// ----------------------------------------------------------------------------
export type DiagnosticCode =
  | "capacidad_limitada"
  | "capacidad_ociosa"
  | "margen_bajo"
  | "demanda_en_caida"
  | "liquidez_critica"
  | "marketing_pesado"
  | "servicio_debil"
  | "presion_competitiva";

export type Severity = "baja" | "media" | "alta";

export interface DiagnosticLabel {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  metricValue: number | string;
}

// ----------------------------------------------------------------------------
// Decisiones e IA
// ----------------------------------------------------------------------------
export type DecisionCategory =
  | "marketing"
  | "precio"
  | "operaciones"
  | "personal"
  | "producto"
  | "fidelizacion"
  | "costos"
  | "inversion";

export interface DemandLift {
  start: number;
  end: number;
  curve: "linear" | "pulse";
  lagMonths: number;
}

export interface DecisionAssumption {
  text: string;
  confidence: "baja" | "media" | "alta";
}

export interface Decision {
  id: string;
  name: string;
  category: DecisionCategory;
  description: string;
  oneTimeCost: number; // Se paga en el mes 1
  fixedDelta: number; // Cambio mensual de costos fijos
  marketingDelta: number;
  priceChangePct: number; // -40 a +40
  varCostDeltaPct: number; // -20 a +20 (puntos porcentuales)
  capacityChangePct: number; // -50 a +100
  demandLift: DemandLift;
  satisfactionPerMonth: number; // -3 a +3
  pros: string[];
  cons: string[];
  risks: string[];
  assumptions: DecisionAssumption[];
  requiresFinancing: boolean;
}

// ----------------------------------------------------------------------------
// Simulación y Eventos
// ----------------------------------------------------------------------------
export interface TriggeredEvent {
  id: string;
  name: string;
  triggeredAtMonth: number;
  durationMonths: number;
  severity: Severity;
  message: string;
  // Efectos
  demandMultiplier?: number;
  satisfactionDelta?: number;
  fixedCostDelta?: number;
  elasticityMultiplier?: number;
}

export interface SimulationMonthState {
  t: number;
  demanda: number;
  capacidad: number;
  atendidos: number;
  exceso: number;
  ticket: number;
  satisfaccion: number; // 0 - 100
  reputacion: number; // 0 - 100
  ingresos: number;
  costoVariable: number;
  costosFijos: number;
  marketing: number;
  deuda: number;
  oneTimeCost: number;
  beneficio: number;
  caja: number;
  activeEvents: TriggeredEvent[];
}

export interface SimulationRun {
  runType: "base" | "pesimista" | "optimista";
  months: SimulationMonthState[];
  triggeredEvents: TriggeredEvent[];
  summary: {
    beneficioAcumulado: number;
    beneficioFinal: number;
    cajaMinima: number;
    cajaFinal: number;
    clientesFinales: number;
    satisfaccionFinal: number;
    reputacionFinal: number;
    paybackMonth: number | null;
  };
}

export interface SimulationResult {
  decisionId?: string;
  decisionName?: string;
  horizon: number;
  base: SimulationRun;
  pesimista: SimulationRun;
  optimista: SimulationRun;
}

// ----------------------------------------------------------------------------
// Árbol de Consecuencias
// ----------------------------------------------------------------------------
export type TreeNodeType =
  | "raiz"
  | "decision"
  | "resultado"
  | "evento"
  | "seguimiento";

export interface NodeMetrics {
  beneficioAcumulado: number;
  beneficioMes: number;
  caja: number;
  clientes: number;
  satisfaccion: number;
  reputacion: number;
  eventosNegativos: number;
}

export interface NodeDelta {
  beneficioDeltaVsParent: number;
  cajaDeltaVsParent: number;
  clientesDeltaVsParent: number;
  satisfaccionDeltaVsParent: number;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  type: TreeNodeType;
  horizon?: 1 | 6 | 12 | 24;
  decisionId?: string;
  stateSnapshot: SimulationMonthState;
  deltaVsParent?: NodeDelta;
  events: TriggeredEvent[];
  metrics: NodeMetrics;
  childrenIds: string[];
  depth: number;
}

export interface ConsequenceTree {
  id: string;
  rootId: string;
  activeNodeId: string;
  nodes: Record<string, TreeNode>;
}

// ----------------------------------------------------------------------------
// Comparación y Explicación
// ----------------------------------------------------------------------------
export interface PathComparison {
  decisionId: string;
  decisionName: string;
  beneficioAcumulado: number;
  beneficioUltimoMes: number;
  cajaMinima: number;
  paybackMonth: number | null;
  satisfaccionFinal: number;
  reputacionFinal: number;
  clientesFinales: number;
  eventosNegativos: number;
  difVsSinCambios: {
    beneficioAcumulado: number;
    cajaFinal: number;
    clientesFinales: number;
  };
  score: number;
}

export interface ComparisonResult {
  sinCambios: SimulationRun;
  paths: PathComparison[];
  divergencePoints: { [pathId: string]: number | null };
  usedWeights: Record<string, number>;
  ranking: PathComparison[];
}

export interface ExplanationOutput {
  cadenaCausal: string;
  riesgosNoConsiderados: string[];
  recomendacion: string;
  respuestaConsulta?: string;
  numerosAuditados: number[];
  esPlantillaRespaldo: boolean;
}
