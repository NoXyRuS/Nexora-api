import { describe, it, expect } from "vitest";
import { validateCaseForm } from "../src/form/validate.js";
import { CaseFormInput } from "../src/types/index.js";

const validBaseForm: CaseFormInput = {
  rubro: "gastronomia",
  tipoOferta: "producto",
  moneda: "USD",
  descripcionLibre: "Restaurante de comida fusión en zona comercial",
  clientesPorMes: 1000,
  ticketPromedio: 25,
  tendenciaUltimos3Meses: { tipo: "creciendo", porcentaje: 5 },
  estacionalidad: "ninguna",
  costoVariablePct: 35,
  costosFijosMensuales: 8000,
  desgloseCostosFijos: { personal: 5000, alquiler: 2000, servicios: 1000 },
  marketingMensual: 1500,
  cuotasDeudaMensuales: 500,
  capacidadMaximaMes: 1200,
  numeroEmpleados: 8,
  nivelCompetencia: "media",
  cajaDisponible: 20000,
  satisfaccionClientes: 4,
  reputacion: 4,
  problemaPrincipal: {
    categoria: "capacidad",
    descripcion: "Cuellos de botella en horas punta",
  },
  objetivoPrioritario: "rentabilidad",
  restricciones: ["no despedir"],
  horizonte: 12,
};

describe("Módulo Form & Profile", () => {
  it("valida un formulario correcto y normaliza derivados", () => {
    const res = validateCaseForm(validBaseForm);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.profile).toBeDefined();

    const d = res.profile!.derivatives;
    // Ingresos: 1000 * 25 = 25000
    expect(d.ingresos).toBe(25000);
    // Costo variable: 25000 * 0.35 = 8750
    expect(d.costosVariables).toBe(8750);
    // Costos totales: 8750 + 8000 + 1500 + 500 = 18750
    expect(d.costosTotales).toBe(18750);
    // Beneficio: 25000 - 18750 = 6250
    expect(d.beneficioMensual).toBe(6250);
    // Margen: (6250 / 25000) * 100 = 25%
    expect(d.margenPct).toBe(25);
    // Utilización: 1000 / 1200 = 0.8333
    expect(d.utilizacion).toBeCloseTo(0.8333, 3);
    // Runway debe ser null porque hay beneficio positivo
    expect(d.runwayMeses).toBeNull();
  });

  it("calcula runway correctamente cuando hay pérdida mensual", () => {
    const losingForm: CaseFormInput = {
      ...validBaseForm,
      costosFijosMensuales: 20000, // Hace que los costos superen los ingresos
      cajaDisponible: 15000,
    };
    const res = validateCaseForm(losingForm);
    expect(res.isValid).toBe(true);
    const d = res.profile!.derivatives;
    // Ingresos = 25000, CostosTotales = 8750 + 20000 + 1500 + 500 = 30750
    // Beneficio = -5750
    expect(d.beneficioMensual).toBe(-5750);
    // Runway = 15000 / 5750 = 2.61 meses
    expect(d.runwayMeses).toBeCloseTo(2.61, 2);
  });

  it("registra supuestos (origin: default) ante campos opcionales vacíos", () => {
    const minimalForm: Partial<CaseFormInput> = {
      rubro: "servicios",
      tipoOferta: "servicio",
      moneda: "USD",
      clientesPorMes: 100,
      ticketPromedio: 50,
      tendenciaUltimos3Meses: { tipo: "estable", porcentaje: 0 },
      costoVariablePct: 20,
      costosFijosMensuales: 2000,
      marketingMensual: 300,
      capacidadMaximaMes: 150,
      numeroEmpleados: 2,
      nivelCompetencia: "baja",
      cajaDisponible: 5000,
      problemaPrincipal: {
        categoria: "ventas",
        descripcion: "Falta de clientes nuevos",
      },
      objetivoPrioritario: "crecimiento",
      horizonte: 12,
    };

    const res = validateCaseForm(minimalForm);
    expect(res.isValid).toBe(true);
    const originDefaults = res.assumptions.filter(
      (a) => a.origin === "default"
    );
    expect(originDefaults.length).toBeGreaterThanOrEqual(4);
    // Verificar que se asignó satisfacción por defecto 70/100 (3.5/5)
    expect(res.profile?.satisfaccionBase).toBe(70);
  });

  it("emite advertencia de sobreocupación si la capacidad es menor que la demanda", () => {
    const overloaded = {
      ...validBaseForm,
      clientesPorMes: 1500,
      capacidadMaximaMes: 1000,
    };
    const res = validateCaseForm(overloaded);
    expect(res.isValid).toBe(true);
    expect(
      res.warnings.some((w) => w.toLowerCase().includes("sobreocupación"))
    ).toBe(true);
  });

  it("rechaza datos fuera de rango o inválidos", () => {
    const invalidForm = {
      ...validBaseForm,
      costoVariablePct: 150, // Inválido > 100
      clientesPorMes: -5, // Inválido <= 0
      horizonte: 36, // Inválido != 12 o 24
    };
    const res = validateCaseForm(invalidForm);
    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });
});
