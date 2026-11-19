// ============================================================================
// Validación del Formulario de Caso de Negocio
// ============================================================================

import {
  CaseFormInput,
  FormValidationResult,
  Assumption,
} from "../types/index.js";
import { normalizeProfile } from "../profile/normalize.js";

/**
 * Valida los datos del formulario de caso y registra supuestos por defecto.
 */
export function validateCaseForm(raw: unknown): FormValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const assumptions: Assumption[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      isValid: false,
      errors: ["El formulario debe ser un objeto válido"],
      warnings,
      assumptions,
    };
  }

  const input = raw as Partial<CaseFormInput>;

  // A. Negocio
  const rubrosValidos = [
    "comercio",
    "gastronomia",
    "servicios",
    "manufactura",
    "educacion",
    "otro",
  ];
  if (!input.rubro || !rubrosValidos.includes(input.rubro)) {
    errors.push(
      `El rubro es obligatorio y debe ser uno de: ${rubrosValidos.join(", ")}`
    );
  }

  const tiposOfertaValidos = ["producto", "servicio", "mixto"];
  if (!input.tipoOferta || !tiposOfertaValidos.includes(input.tipoOferta)) {
    errors.push(
      `El tipo de oferta es obligatorio y debe ser uno de: ${tiposOfertaValidos.join(
        ", "
      )}`
    );
  }

  if (!input.moneda || typeof input.moneda !== "string" || input.moneda.trim() === "") {
    errors.push("La moneda es obligatoria (ej: USD, EUR, PEN)");
  }

  if (input.descripcionLibre !== undefined) {
    if (typeof input.descripcionLibre !== "string") {
      errors.push("La descripción libre debe ser texto");
    } else if (input.descripcionLibre.length > 500) {
      errors.push("La descripción libre no puede exceder 500 caracteres");
    }
  } else {
    assumptions.push({
      id: "assump_descripcion",
      field: "descripcionLibre",
      value: "",
      reason: "Sin descripción provista por el usuario",
      origin: "default",
    });
  }

  // B. Ventas
  if (
    input.clientesPorMes === undefined ||
    typeof input.clientesPorMes !== "number" ||
    input.clientesPorMes <= 0
  ) {
    errors.push("Clientes por mes debe ser un número mayor a 0");
  }

  if (
    input.ticketPromedio === undefined ||
    typeof input.ticketPromedio !== "number" ||
    input.ticketPromedio <= 0
  ) {
    errors.push("El ticket promedio debe ser un número mayor a 0");
  }

  if (!input.tendenciaUltimos3Meses || typeof input.tendenciaUltimos3Meses !== "object") {
    errors.push("La tendencia de los últimos 3 meses es obligatoria");
  } else {
    const tiposTendencia = ["cayendo", "estable", "creciendo"];
    if (!tiposTendencia.includes(input.tendenciaUltimos3Meses.tipo)) {
      errors.push(
        `El tipo de tendencia debe ser: ${tiposTendencia.join(", ")}`
      );
    }
    if (
      typeof input.tendenciaUltimos3Meses.porcentaje !== "number" ||
      input.tendenciaUltimos3Meses.porcentaje < 0 ||
      input.tendenciaUltimos3Meses.porcentaje > 100
    ) {
      errors.push("El porcentaje de tendencia debe estar entre 0% y 100%");
    }
  }

  if (input.estacionalidad === undefined) {
    assumptions.push({
      id: "assump_estacionalidad",
      field: "estacionalidad",
      value: "ninguna",
      reason: "Se asume estacionalidad neutra por defecto",
      origin: "default",
    });
  } else {
    const estacionalidades = ["ninguna", "leve", "fuerte"];
    if (!estacionalidades.includes(input.estacionalidad)) {
      errors.push(
        `La estacionalidad debe ser una de: ${estacionalidades.join(", ")}`
      );
    }
  }

  // C. Costos
  if (
    input.costoVariablePct === undefined ||
    typeof input.costoVariablePct !== "number" ||
    input.costoVariablePct < 0 ||
    input.costoVariablePct > 100
  ) {
    errors.push("El costo variable debe ser un porcentaje entre 0 y 100");
  }

  if (
    input.costosFijosMensuales === undefined ||
    typeof input.costosFijosMensuales !== "number" ||
    input.costosFijosMensuales < 0
  ) {
    errors.push("Los costos fijos mensuales deben ser mayores o iguales a 0");
  }

  if (input.desgloseCostosFijos) {
    const { personal = 0, alquiler = 0, servicios = 0, otros = 0 } =
      input.desgloseCostosFijos;
    const sumaDesglose = personal + alquiler + servicios + otros;
    if (
      input.costosFijosMensuales !== undefined &&
      Math.abs(sumaDesglose - input.costosFijosMensuales) > 1
    ) {
      warnings.push(
        `El desglose de costos fijos (${sumaDesglose}) no coincide exactamente con el total (${input.costosFijosMensuales})`
      );
    }
  } else {
    assumptions.push({
      id: "assump_desglose_costos",
      field: "desgloseCostosFijos",
      value: {},
      reason: "Sin desglose detallado de costos fijos",
      origin: "default",
    });
  }

  if (
    input.marketingMensual === undefined ||
    typeof input.marketingMensual !== "number" ||
    input.marketingMensual < 0
  ) {
    errors.push("El presupuesto de marketing debe ser mayor o igual a 0");
  }

  if (input.cuotasDeudaMensuales === undefined) {
    assumptions.push({
      id: "assump_cuotas_deuda",
      field: "cuotasDeudaMensuales",
      value: 0,
      reason: "Se asume deuda cero al no ser especificada",
      origin: "default",
    });
  } else if (
    typeof input.cuotasDeudaMensuales !== "number" ||
    input.cuotasDeudaMensuales < 0
  ) {
    errors.push("Las cuotas de deuda mensuales deben ser mayores o iguales a 0");
  }

  // D. Capacidad
  if (
    input.capacidadMaximaMes === undefined ||
    typeof input.capacidadMaximaMes !== "number" ||
    input.capacidadMaximaMes <= 0
  ) {
    errors.push("La capacidad máxima mensual debe ser un número mayor a 0");
  }

  if (
    input.numeroEmpleados === undefined ||
    typeof input.numeroEmpleados !== "number" ||
    input.numeroEmpleados < 0
  ) {
    errors.push("El número de empleados debe ser mayor o igual a 0");
  }

  // Coherencia: capacidad vs clientes
  if (
    typeof input.capacidadMaximaMes === "number" &&
    typeof input.clientesPorMes === "number" &&
    input.capacidadMaximaMes < input.clientesPorMes
  ) {
    warnings.push(
      "La capacidad máxima de atención es menor que la demanda actual de clientes (sobreocupación detectada)"
    );
  }

  // E. Contexto
  const competencias = ["baja", "media", "alta"];
  if (!input.nivelCompetencia || !competencias.includes(input.nivelCompetencia)) {
    errors.push(
      `El nivel de competencia debe ser uno de: ${competencias.join(", ")}`
    );
  }

  if (
    input.cajaDisponible === undefined ||
    typeof input.cajaDisponible !== "number"
  ) {
    errors.push("La caja disponible es obligatoria y debe ser un valor numérico");
  }

  if (input.satisfaccionClientes === undefined) {
    assumptions.push({
      id: "assump_satisfaccion",
      field: "satisfaccionClientes",
      value: 3.5,
      reason: "Satisfacción promedio supuesta en 3.5/5 (70/100)",
      origin: "default",
      confidence: "media",
    });
  } else if (
    typeof input.satisfaccionClientes !== "number" ||
    input.satisfaccionClientes < 1 ||
    input.satisfaccionClientes > 5
  ) {
    errors.push("La satisfacción de clientes debe estar en una escala de 1 a 5");
  }

  if (input.reputacion === undefined) {
    assumptions.push({
      id: "assump_reputacion",
      field: "reputacion",
      value: 3.5,
      reason: "Reputación supuesta en 3.5/5 (70/100)",
      origin: "default",
      confidence: "media",
    });
  } else if (
    typeof input.reputacion !== "number" ||
    input.reputacion < 1 ||
    input.reputacion > 5
  ) {
    errors.push("La reputación debe estar en una escala de 1 a 5");
  }

  // F. Objetivos
  if (
    !input.problemaPrincipal ||
    typeof input.problemaPrincipal !== "object" ||
    !input.problemaPrincipal.descripcion ||
    input.problemaPrincipal.descripcion.trim() === ""
  ) {
    errors.push(
      "El problema principal es obligatorio (categoría y descripción)"
    );
  }

  const objetivosValidos = [
    "rentabilidad",
    "crecimiento",
    "estabilidad",
    "reducir_riesgo",
  ];
  if (
    !input.objetivoPrioritario ||
    !objetivosValidos.includes(input.objetivoPrioritario)
  ) {
    errors.push(
      `El objetivo prioritario debe ser uno de: ${objetivosValidos.join(", ")}`
    );
  }

  if (input.restricciones === undefined) {
    assumptions.push({
      id: "assump_restricciones",
      field: "restricciones",
      value: [],
      reason: "Sin restricciones explícitas impuestas",
      origin: "default",
    });
  } else if (!Array.isArray(input.restricciones)) {
    errors.push("Las restricciones deben ser una lista de cadenas de texto");
  }

  if (input.horizonte !== 12 && input.horizonte !== 24) {
    errors.push("El horizonte de simulación debe ser de 12 o 24 meses");
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      assumptions,
    };
  }

  // Generar perfil normalizado completo
  const fullInput = input as CaseFormInput;
  const profile = normalizeProfile(fullInput, assumptions);

  return {
    isValid: true,
    errors: [],
    warnings,
    assumptions,
    profile,
  };
}
