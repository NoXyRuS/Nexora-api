# Nexora API

Backend de Nexora desarrollado con **Supabase Edge Functions** en **TypeScript**.

## 📁 Estructura

```text
backend/
├── supabase/
│   ├── config.toml        # Configuración del proyecto Supabase
│   └── functions/         # Edge Functions en TypeScript
│       └── hello/         # Función de ejemplo
│           ├── deno.json
│           └── index.ts
├── .env.example
├── .gitignore
└── package.json
```

## 🚀 Inicio Rápido

### Servir funciones localmente
```bash
npm run functions:serve
```

### Crear una nueva función
```bash
npx supabase functions new <nombre-funcion>
```

### Desplegar a Supabase
```bash
npx supabase login
npx supabase link --project-ref <tu-project-id>
npx supabase functions deploy <nombre-funcion>
```
