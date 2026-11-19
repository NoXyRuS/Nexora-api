import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";

// Helper to load or refresh .env
function loadEnv() {
  const candidates = [
    join(Deno.cwd(), ".env"),
    join(Deno.cwd(), "Nexora-api", ".env"),
    join(Deno.cwd(), "..", ".env"),
    "C:/Users/gegon/OneDrive/Desktop/Neora/Nexora-api/.env",
    "C:/Users/gegon/OneDrive/Desktop/Neora/.env",
  ];

  for (const envPath of candidates) {
    if (existsSync(envPath)) {
      try {
        const envText = Deno.readTextFileSync(envPath);
        for (const line of envText.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (val) {
              Deno.env.set(key, val);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }
}

loadEnv();

// Fallback defaults for Supabase environment
if (!Deno.env.get("SUPABASE_URL")) {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
}
if (!Deno.env.get("SUPABASE_PUBLISHABLE_KEY")) {
  Deno.env.set("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH");
}
if (!Deno.env.get("SUPABASE_ANON_KEY")) {
  Deno.env.set("SUPABASE_ANON_KEY", "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH");
}

const port = Number(Deno.env.get("PORT")) || 54321;
const functionsDir = join(Deno.cwd(), "supabase", "functions");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
};

function getAvailableFunctions(): string[] {
  if (!existsSync(functionsDir)) return [];
  try {
    return readdirSync(functionsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

console.log("⚡ Nexora API Local Dev Server iniciándose...");
console.log(`📁 Directorio de funciones: ${functionsDir}`);
console.log(`📡 Funciones detectadas: ${getAvailableFunctions().join(", ") || "ninguna"}`);

Deno.serve({ port }, async (req: Request) => {
  // Always refresh env in case .env was modified
  loadEnv();

  const url = new URL(req.url);

  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`\n📡 [${new Date().toLocaleTimeString()}] ${req.method} ${url.pathname}`);

  // Health check / index route
  if (url.pathname === "/" || url.pathname === "/functions/v1" || url.pathname === "/functions/v1/") {
    return Response.json(
      {
        status: "ok",
        message: "Nexora Local Edge Functions Server activo",
        functions: getAvailableFunctions().map((fn) => ({
          name: fn,
          url: `http://127.0.0.1:${port}/functions/v1/${fn}`,
        })),
      },
      { headers: corsHeaders }
    );
  }

  // Extract function name: /functions/v1/:name or /:name
  let functionName = "";
  if (url.pathname.startsWith("/functions/v1/")) {
    functionName = url.pathname.slice("/functions/v1/".length).split("/")[0];
  } else {
    functionName = url.pathname.slice(1).split("/")[0];
  }

  if (!functionName) {
    console.warn(`⚠️ Función no especificada en ruta: ${url.pathname}`);
    return Response.json({ error: "Función no especificada" }, { status: 400, headers: corsHeaders });
  }

  const functionEntry = join(functionsDir, functionName, "index.ts");
  if (!existsSync(functionEntry)) {
    console.warn(`❌ Función '${functionName}' no encontrada en: ${functionEntry}`);
    return Response.json(
      {
        error: `Función '${functionName}' no encontrada`,
        availableFunctions: getAvailableFunctions(),
      },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    const fileUrl = `file:///${functionEntry.replace(/\\/g, "/")}`;
    const module = await import(fileUrl);
    const handler = module.default;

    let res: Response;
    if (handler && typeof handler.fetch === "function") {
      res = await handler.fetch(req, {});
    } else if (typeof handler === "function") {
      res = await handler(req);
    } else {
      console.error(`❌ Función '${functionName}' no exporta un default handler válido`);
      return Response.json(
        { error: `El archivo index.ts de '${functionName}' no exporta un default handler válido.` },
        { status: 500, headers: corsHeaders }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ [${functionName}] Respuesta ${res.status} (${elapsed}ms)`);

    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err: any) {
    console.error(`❌ Error ejecutando la función '${functionName}':`, err);
    return Response.json(
      {
        error: `Error interno ejecutando función '${functionName}'`,
        details: err?.message || String(err),
      },
      { status: 500, headers: corsHeaders }
    );
  }
});
