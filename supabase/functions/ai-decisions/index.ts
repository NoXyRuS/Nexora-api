function resolveApiKey(clientApiKey?: string): string {
  if (clientApiKey && clientApiKey.trim()) return clientApiKey.trim();
  const envKey = Deno.env.get("OPENAI_API_KEY");
  if (envKey && envKey.trim()) return envKey.trim();
  return "";
}

export default {
  fetch: async (req: Request) => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    };

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const {
        profile,
        diagnosis,
        apiKey: clientApiKey,
        step = 1,
        previousDecisions = [],
      } = body;

      if (!profile) {
        return Response.json(
          { error: "Se requiere el objeto 'profile'." },
          { status: 400, headers: corsHeaders }
        );
      }

      // El backend consume OPENAI_API_KEY directamente de su entorno (.env) o resolución de archivo
      const apiKey = resolveApiKey(clientApiKey);

      if (!apiKey || apiKey.trim() === "") {
        return Response.json(
          {
            success: false,
            error: "Falta OPENAI_API_KEY en el backend. Configúrala en Nexora-api/.env o proporciónala.",
            needApiKey: true,
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const isFollowUp = Number(step) > 1 && Array.isArray(previousDecisions) && previousDecisions.length > 0;
      const roundContext = isFollowUp
        ? `Esta es la Ronda ${step} de 3 (decisiones de seguimiento). En los pasos anteriores se seleccionaron y ejecutaron las siguientes decisiones estratégicas: ${previousDecisions.map((d: any) => `"${d.name}" (${d.category})`).join(", ")}.
El estado actual de la empresa (caja, clientes, beneficio) ya refleja el impacto de esas medidas previas.`
        : `Esta es la Ronda 1 de 3 (decisiones iniciales para abordar el problema principal).`;

      const systemPrompt = `Eres un consultor de negocios y estratega empresarial para el simulador Nexora. Recibes el perfil de un negocio, su diagnóstico numérico, su descripción y su problema principal.
${roundContext}
Tu tarea es proponer exactamente 4 decisiones estratégicas distintas, cuantitativas y adaptadas con máxima especificidad a este negocio y su situación actual.

Reglas obligatorias:
(1) ${isFollowUp ? 'Las 4 decisiones deben ser pasos lógicos de continuidad, optimización o expansión que respondan al nuevo estado alcanzado.' : 'Al menos 2 decisiones deben atacar directamente el problema principal y la situación descrita.'}
(2) Incluye variedad de categorías ('marketing', 'precio', 'operaciones', 'personal', 'producto', 'fidelizacion', 'costos', 'inversion').
(3) Una decisión debe ser de bajo costo o costo cero, una de alto impacto/crecimiento, y una innovadora o de consolidación.
(4) Respeta estrictamente las restricciones del usuario (ej. si dice 'no bajar precios', priceChangePct >= 0; si dice 'no despedir', fixedDelta no puede implicar reducción de planilla).
(5) Ajusta los números y costos a la moneda (${profile.moneda || 'USD'}), a la escala de ingresos mensuales y a la caja disponible (${profile.cajaDisponible}).
(6) NUNCA calcules ni menciones proyecciones futuras de ventas o beneficios en el texto; solo define los parámetros de impacto.
(7) Responde estrictamente en formato JSON con la clave 'decisiones' que contenga el array de exactamente 4 decisiones.

Esquema de cada objeto decisión:
{
  "id": "dec_identificador_unico",
  "name": "Nombre corto y claro de la decisión",
  "category": "marketing" | "precio" | "operaciones" | "personal" | "producto" | "fidelizacion" | "costos" | "inversion",
  "description": "Explicación de qué se hará y por qué ayuda a este caso específico",
  "oneTimeCost": number (costo único inicial en moneda local),
  "fixedDelta": number (cambio mensual en costos fijos),
  "marketingDelta": number (cambio mensual en presupuesto de marketing),
  "priceChangePct": number (porcentaje de cambio de precio, entre -30 y 40),
  "varCostDeltaPct": number (impacto en % de costo variable, entre -20 y 30),
  "capacityChangePct": number (impacto en % de capacidad instalada, entre -30 y 100),
  "demandLift": {
    "start": number (impacto inicial en demanda %, ej. 8),
    "end": number (impacto final en demanda %, ej. 15),
    "curve": "linear" | "front_loaded" | "pulse" | "s_curve",
    "lagMonths": number (meses de retraso para que empiece a surtir efecto, ej. 0 o 1)
  },
  "satisfactionPerMonth": number (impacto mensual en satisfacción, ej. 0.5 a 2.5),
  "pros": ["ventaja 1 concreta", "ventaja 2"],
  "cons": ["desventaja o costo 1", "desventaja 2"],
  "risks": ["riesgo principal de mercado o ejecución"],
  "assumptions": [{ "text": "supuesto clave detrás de la medida", "confidence": "alta" | "media" | "baja" }],
  "requiresFinancing": boolean
}`;

      const userPrompt = JSON.stringify({
        ronda: `Paso ${step} de 3`,
        decisionesPrevias: previousDecisions,
        perfil: {
          rubro: profile.rubro,
          tipoOferta: profile.tipoOferta,
          moneda: profile.moneda,
          descripcion: profile.descripcionLibre,
          clientesPorMes: profile.clientesPorMes,
          ticketPromedio: profile.ticketPromedio,
          cajaDisponible: profile.cajaDisponible,
          costosFijosMensuales: profile.costosFijosMensuales,
          costoVariablePct: profile.costoVariablePct,
          marketingMensual: profile.marketingMensual,
          numeroEmpleados: profile.numeroEmpleados,
          nivelCompetencia: profile.nivelCompetencia,
        },
        diagnostico: diagnosis || [],
        problemaPrincipal: profile.problemaPrincipal,
        objetivoPrioritario: profile.objetivoPrioritario,
        restricciones: profile.restricciones,
        horizonteMeses: profile.horizonte || 12,
      }, null, 2);

      // Call OpenAI API
      const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
      console.log(`🤖 [ai-decisions] Consultando a OpenAI (${model}, key: ${apiKey.slice(0, 10)}...)...`);

      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analiza esta empresa y genera las decisiones estratégicas requeridas:\n\n${userPrompt}` },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        console.error(`❌ [ai-decisions] OpenAI devolvió status ${openAiRes.status}:`, errText);
        return Response.json(
          {
            success: false,
            error: `Error de OpenAI (${openAiRes.status}): ${errText}`,
          },
          { status: openAiRes.status, headers: corsHeaders }
        );
      }

      console.log(`✨ [ai-decisions] OpenAI respondió exitosamente (200 OK)`);

      const openAiData = await openAiRes.json();
      const content = openAiData.choices?.[0]?.message?.content;

      return Response.json(
        {
          success: true,
          content,
          model: openAiData.model || "gpt-4o-mini",
        },
        { headers: corsHeaders }
      );
    } catch (err: any) {
      console.error("Error en ai-decisions:", err);
      return Response.json(
        { success: false, error: err?.message || String(err) },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
