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
      const { profile, decision, simResult, question, apiKey: clientApiKey } = body;

      const apiKey = resolveApiKey(clientApiKey);

      if (!apiKey) {
        return Response.json(
          {
            success: false,
            error: "Falta OPENAI_API_KEY.",
            needApiKey: true,
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const systemPrompt = `Eres un consultor financiero y analista de negocios en Nexora. Explicas los resultados de la simulación empresarial en lenguaje claro, empático y profesional.
Reglas:
(1) Utiliza estrictamente las cifras numéricas del resultado recibido (caja final, clientes, beneficio acumulado, ROI).
(2) Explica la relación causa-efecto de la decisión seleccionada sobre los costos, demanda y satisfacción.
(3) Si el usuario hace una pregunta específica en 'pregunta', respóndela directamente con recomendaciones prácticas basadas en los datos simulados.`;

      const userPrompt = JSON.stringify({
        perfil: {
          rubro: profile?.rubro,
          moneda: profile?.moneda,
          descripcion: profile?.descripcionLibre,
        },
        decision: decision ? {
          name: decision.name,
          category: decision.category,
          oneTimeCost: decision.oneTimeCost,
          pros: decision.pros,
          cons: decision.cons,
          risks: decision.risks,
        } : null,
        resumenSimulacion: simResult?.base?.summary,
        pregunta: question || "Genera un análisis ejecutivo de este escenario.",
      }, null, 2);

      const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
      console.log(`🤖 [ai-explain] Consultando explicación a OpenAI (${model})...`);

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
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!openAiRes.ok) {
        const errText = await openAiRes.text();
        console.error(`❌ [ai-explain] Error de OpenAI (${openAiRes.status}):`, errText);
        return Response.json(
          { success: false, error: `Error de OpenAI: ${errText}` },
          { status: openAiRes.status, headers: corsHeaders }
        );
      }

      console.log(`✨ [ai-explain] Explicación generada exitosamente`);

      const openAiData = await openAiRes.json();
      const answer = openAiData.choices?.[0]?.message?.content;

      return Response.json(
        {
          success: true,
          answer,
          model: openAiData.model || "gpt-4o-mini",
        },
        { headers: corsHeaders }
      );
    } catch (err: any) {
      console.error("Error en ai-explain:", err);
      return Response.json(
        { success: false, error: err?.message || String(err) },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
