// ============================================================================
// Persistencia y Versionado de Sesión del Simulador «Efecto Mariposa»
// ============================================================================

import {
  NormalizedProfile,
  Decision,
  ConsequenceTree,
  Assumption,
} from "../types/index.js";

export const SESSION_SCHEMA_VERSION = "1.0.0";

export interface SessionState {
  version: string;
  createdAt: string;
  updatedAt: string;
  profile: NormalizedProfile;
  assumptions: Assumption[];
  decisions: Decision[];
  tree: ConsequenceTree;
  activeNodeId: string;
}

/**
 * Serializa la sesión completa a una cadena JSON versionada.
 */
export function serializeSession(session: SessionState): string {
  return JSON.stringify(
    {
      ...session,
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Deserializa y valida el esquema versionado de una sesión previa.
 */
export function deserializeSession(jsonString: string): SessionState {
  const parsed = JSON.parse(jsonString);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("El contenido de la sesión no es un objeto JSON válido");
  }

  if (!parsed.version) {
    throw new Error("La sesión no posee un campo de versión");
  }

  // Compatibilidad hacia atrás si difiere la versión
  if (!parsed.profile || !parsed.tree) {
    throw new Error("Estructura de sesión incompleta o corrupta (falta perfil o árbol)");
  }

  return parsed as SessionState;
}

/**
 * Crea un estado de sesión inicial nuevo a partir de un perfil confirmado y su árbol.
 */
export function createNewSession(
  profile: NormalizedProfile,
  tree: ConsequenceTree,
  decisions: Decision[] = []
): SessionState {
  const now = new Date().toISOString();
  return {
    version: SESSION_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    profile,
    assumptions: profile.assumptions,
    decisions,
    tree,
    activeNodeId: tree.activeNodeId,
  };
}
