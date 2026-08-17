# CLAUDE.md — Contexto del proyecto

> Este archivo va en la **raíz del repo**. Claude Code lo lee automáticamente en cada sesión,
> así que no hace falta re-explicar el proyecto cada vez que abrís una conversación nueva.

---

## 1. Qué es esto

CRM comercial para **Scalerics**, empresa uruguaya que vende insumos de limpieza a otras empresas.

Es una **prueba técnica con demo presencial**. El plazo es corto y el objetivo no es un producto completo, sino un espinazo funcional end-to-end que se pueda demostrar y defender.

### El pedido del cliente, textual (lo importante)

- 4 vendedores en la calle, cada uno con su cartera en un Excel propio o en el celular
- *"Si un vendedor se va, se lleva los contactos y perdemos el cliente"*
- *"Yo no tengo idea de qué está pasando"*
- *"Hoy eso me lo dicen de palabra en la reunión de los lunes y siempre está todo 'en proceso', nunca sé bien"*
- *"Tengo clientes que compraban todos los meses y hace medio año no compran y nadie se dio cuenta"*
- Quiere alertas por WhatsApp al vendedor
- *"Lo tiene que poder usar gente que no es muy de la computadora"*
- *"Que también ande en el celular porque están todo el día afuera"*
- Colores de la empresa: **azul y gris**
- En **octubre** arranca la temporada alta

### El problema de fondo

No es "falta un Excel mejor". Es que **la cartera de clientes hoy es propiedad del vendedor, no de la empresa**. Todas las decisiones de diseño se ordenan alrededor de eso.

---

## 2. Estado actual del proyecto

✅ Ya hecho — **no rehacer**:

- Proyecto Angular + Cloudflare Workers creado con `npm create cloudflare@latest`
- Desplegado y funcionando en **https://crm-scalerics.felipetrias.workers.dev**
- Repo en GitHub: `FelipeTrias/crm-scalerics`, rama `main`
- GitHub Actions desplegando automáticamente en cada push a `main`

⬜ Pendiente:

1. Base de datos D1 + schema
2. Datos de prueba realistas (seed)
3. API en el Worker
4. Pantallas en Angular
5. Motor de alertas (cron trigger)
6. README y cierre

---

## 3. Stack y arquitectura

Todo corre dentro de **un solo Worker de Cloudflare**:

```
Worker "crm-scalerics"
├── /*        → Angular (SSR + static assets)
├── /api/*    → API propia (TypeScript)
└── cron      → motor de alertas diario
        │
        └── binding DB → Cloudflare D1 (SQLite)
```

| Pieza | Qué es |
|---|---|
| Angular 22 | Front, con SSR habilitado |
| Cloudflare Workers | Runtime (V8 isolates — **no hay Node.js completo ni .NET**) |
| Cloudflare D1 | Base de datos SQLite gestionada |
| Cron Triggers | Tareas programadas del mismo Worker |
| Wrangler | CLI de Cloudflare |

### Por qué no .NET

El desarrollador viene de .NET, pero Cloudflare Workers corre V8 isolates: solo JavaScript/TypeScript y WebAssembly. No hay CLR. La única forma de correr .NET en Cloudflare es Containers, que requiere plan pago e infraestructura adicional. Para este alcance se eligió resolverlo nativo en la plataforma. **No sugerir migrar a .NET.**

---

## 4. Archivos clave y trampas conocidas

⚠️ **Leer esta sección antes de tocar configuración.** Cada punto ya causó un problema real.

### `wrangler.jsonc`

```jsonc
{
  "name": "crm-scalerics",
  "main": "./dist/server/server.mjs",     // ← ARTEFACTO DE BUILD
  "assets": { "binding": "ASSETS", "directory": "./dist/browser" }
}
```

`main` apunta a un archivo que **genera `ng build`** a partir de `src/server.ts`.
**Nunca editar nada dentro de `dist/`** — se regenera y se pierde.
El código del Worker (API, cron) va en **`src/server.ts`**.

### `src/server.ts` — validación de hosts

Angular incorporó validación estricta del header `Host` (parche de seguridad CVE-2026-27739). Si el host no está en la lista, la app responde con un error y no carga.

```ts
const angularApp = new AngularAppEngine({
  allowedHosts: ['localhost', 'crm-scalerics.felipetrias.workers.dev'],
});
```

**Si se agrega un dominio nuevo, hay que agregarlo también acá.** Es la causa del error
`Header "host" with value "..." is not allowed.`

### Acceso al binding de D1 desde el Worker

`createRequestHandler` de Angular solo recibe el `Request`, no el `env`. Para llegar al binding hay que exportar un `fetch` propio que reciba `(request, env, ctx)`, atender `/api/*` ahí, y delegar el resto a Angular. Patrón:

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return apiHandler(request, env, ctx);
    }
    return reqHandler(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(generarAlertas(env.DB));
  },
};
```

### SSR y APIs del navegador

Con SSR activo, el código de componentes corre **también en el servidor**, donde no existen `window`, `document` ni `localStorage`. Acceder a ellos directo rompe el render. Usar `isPlatformBrowser` o `afterNextRender` cuando haga falta.

### Runtime de Workers

No es Node.js. Muchos paquetes de npm que dependen de `fs`, `path` o `crypto` de Node no funcionan. Preferir APIs web estándar (`fetch`, `crypto.subtle`, `URL`). Para hashear contraseñas: **`crypto.subtle` con PBKDF2**, que es nativo.

---

## 5. Modelo de datos

SQLite. Fechas como **texto ISO 8601** (`datetime('now')`), que es lo que ordena y compara bien en SQLite.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin','vendedor')),
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clientes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  razon_social    TEXT NOT NULL,
  nombre_fantasia TEXT,
  rut             TEXT,
  direccion       TEXT,
  ciudad          TEXT,
  rubro           TEXT,
  vendedor_id     INTEGER NOT NULL REFERENCES usuarios(id),
  estado          TEXT NOT NULL DEFAULT 'activo'
                  CHECK (estado IN ('prospecto','activo','inactivo')),
  notas           TEXT,
  eliminado       INTEGER NOT NULL DEFAULT 0,   -- borrado lógico
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por      INTEGER REFERENCES usuarios(id)
);

CREATE TABLE contactos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id),
  nombre        TEXT NOT NULL,
  cargo         TEXT,
  telefono      TEXT,
  whatsapp      TEXT,
  email         TEXT,
  es_principal  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE interacciones (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id            INTEGER NOT NULL REFERENCES clientes(id),
  usuario_id            INTEGER NOT NULL REFERENCES usuarios(id),
  tipo                  TEXT NOT NULL
                        CHECK (tipo IN ('llamada','visita','whatsapp','email')),
  fecha                 TEXT NOT NULL DEFAULT (datetime('now')),
  resultado             TEXT,
  notas                 TEXT,
  proxima_accion        TEXT,
  proxima_accion_fecha  TEXT,
  creado_en             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oportunidades (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id             INTEGER NOT NULL REFERENCES clientes(id),
  vendedor_id            INTEGER NOT NULL REFERENCES usuarios(id),
  titulo                 TEXT NOT NULL,
  monto_estimado         REAL,
  moneda                 TEXT NOT NULL DEFAULT 'UYU'
                         CHECK (moneda IN ('UYU','USD')),
  etapa                  TEXT NOT NULL DEFAULT 'nuevo'
                         CHECK (etapa IN ('nuevo','contactado','presupuesto_enviado',
                                          'negociacion','ganado','perdido')),
  fecha_cierre_estimada  TEXT,
  motivo_perdida         TEXT,
  creado_en              TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE alertas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id         INTEGER NOT NULL REFERENCES clientes(id),
  vendedor_id        INTEGER NOT NULL REFERENCES usuarios(id),
  tipo               TEXT NOT NULL DEFAULT 'sin_contacto'
                     CHECK (tipo IN ('sin_contacto','oportunidad_estancada')),
  dias_sin_contacto  INTEGER,
  mensaje            TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','vista','resuelta')),
  generada_en        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_clientes_vendedor      ON clientes(vendedor_id, eliminado);
CREATE INDEX idx_interacciones_cliente  ON interacciones(cliente_id, fecha DESC);
CREATE INDEX idx_oportunidades_etapa    ON oportunidades(etapa, vendedor_id);
CREATE INDEX idx_alertas_estado         ON alertas(estado, vendedor_id);
```

### Reglas del modelo

- **`ultima_interaccion` no se guarda como columna.** Se calcula con `MAX(fecha)` sobre `interacciones`. Guardarla desnormalizada obliga a mantenerla sincronizada y se desincroniza. El índice `idx_interacciones_cliente` cubre esa consulta.
- **Nada se borra físicamente.** `clientes.eliminado = 1`. Todas las consultas de listado filtran `eliminado = 0`.
- **Días sin contacto:**
  ```sql
  CAST(julianday('now') - julianday(COALESCE(MAX(i.fecha), c.creado_en)) AS INTEGER)
  ```

---

## 6. API

Prefijo `/api`. JSON en request y response. Errores con status HTTP correcto y `{ "error": "mensaje" }`.

```
POST   /api/auth/login          { email, password } → set-cookie httpOnly + { usuario }
POST   /api/auth/logout
GET    /api/me                  → usuario actual

GET    /api/clientes            ?q=&estado=&vendedor=&riesgo=true
POST   /api/clientes
GET    /api/clientes/:id        → cliente + contactos + últimas interacciones
PATCH  /api/clientes/:id
DELETE /api/clientes/:id        → borrado lógico, solo admin

GET    /api/clientes/:id/interacciones
POST   /api/clientes/:id/interacciones

GET    /api/oportunidades       ?etapa=&vendedor=
POST   /api/oportunidades
PATCH  /api/oportunidades/:id   → incluye cambio de etapa

GET    /api/alertas             → pendientes del usuario (todas si admin)
PATCH  /api/alertas/:id         → { estado: 'vista' | 'resuelta' }

GET    /api/dashboard           → métricas del admin
```

### 🔒 Regla no negociable: el filtro por rol va en el servidor

Cada endpoint resuelve el alcance a partir del usuario del token:

- `rol = 'admin'` → ve todo, puede filtrar por vendedor
- `rol = 'vendedor'` → **solo** registros con `vendedor_id = usuario.id`

Nunca filtrar en Angular. Si el filtro está en el front, cualquiera abre las herramientas de desarrollo y ve la cartera completa — que es exactamente el problema que el cliente quiere resolver.

### Autenticación

Login con email + contraseña. Hash **PBKDF2 vía `crypto.subtle`**. JWT firmado en cookie `httpOnly`, `Secure`, `SameSite=Lax`.
No instalar librerías de auth pesadas: no hace falta y muchas no corren en Workers.

---

## 7. Front

### Pantallas, en orden de importancia

1. **Login**
2. **Listado de clientes** — tabla densa en escritorio, tarjetas en celular. Buscador. Chip de días sin contacto con color.
3. **Ficha de cliente** — datos, contactos, timeline de interacciones, botón grande "Registrar contacto"
4. **Clientes en riesgo** — ordenados por días sin contacto desc, con botón de WhatsApp
5. **Pipeline** — columnas por etapa con monto total en cada una
6. **Dashboard** — solo admin

### Reglas de UI

- **Mobile primero.** Los vendedores la usan parados en la calle. Probar todo en viewport de celular.
- **Registrar una interacción tiene que llevar ≤15 segundos**: 4 campos (tipo, resultado, notas, próxima acción). Nada más. Si el formulario crece, el sistema no se usa.
- Áreas táctiles de al menos 44px.
- **"Simple tipo Excel pero mejor"** significa densidad de información y pocos clics — no minimalismo con mucho aire. Tabla ancha, filas compactas, todo a la vista.
- Vocabulario del negocio, en español, sin jerga técnica. "Cartera", "presupuesto enviado", "visita" — no "entity", "record", "submit".

### Semáforo de contacto (aparece en varias pantallas)

| Días sin contacto | Color |
|---|---|
| < 30 | verde |
| 30–60 | amarillo |
| > 60 | rojo |

### Paleta — en `src/styles.css`

```css
:root {
  --azul-900: #0B2545;
  --azul-700: #134074;
  --azul-500: #1B6CA8;
  --gris-700: #4A5568;
  --gris-300: #CBD5E0;
  --gris-100: #F5F7FA;
  --verde:    #2E9E5B;
  --amarillo: #E0A800;
  --rojo:     #D64545;
}
```

El logo lo manda el cliente. Dejar un espacio reservado en la barra superior con las iniciales como placeholder. **No frenar el desarrollo esperándolo.**

### Angular 22 — usar las formas actuales

- Componentes **standalone** (sin `NgModule`)
- **Signals** para estado
- Control de flujo nuevo: `@if`, `@for`, `@switch` — **no** `*ngIf` / `*ngFor`
- `inject()` en lugar de inyección por constructor
- `httpResource` / `HttpClient` con `provideHttpClient()`

Si hay dudas sobre una API de Angular, consultar la documentación actual antes de escribir. Angular cambió mucho en las últimas versiones y el código de memoria suele quedar desactualizado.

---

## 8. Alcance: qué entra y qué no

### Entra (v1)

Clientes, contactos, bitácora de interacciones, cartera por vendedor con permisos, pipeline con etapas cerradas, alertas de inactividad, dashboard, mobile, login.

### No entra — **no implementar aunque parezca fácil**

Facturación, stock, integración contable, app nativa, geolocalización, firma digital, multi-empresa, comisiones, importación de Excel, generación de PDF.

### WhatsApp — límite explícito

El envío automático **no se implementa**. Requiere WhatsApp Business API de Meta: verificación de la empresa, número dedicado y plantillas aprobadas, con plazos de días que no dependen del desarrollo.

Lo que sí se hace:

- El cron genera las alertas de verdad, todos los días
- La alerta aparece en la app
- Un botón abre `https://wa.me/598XXXXXXXX?text=<mensaje url-encoded>` con el mensaje ya redactado

---

## 9. Convenciones de trabajo

### Commits

[Conventional Commits](https://www.conventionalcommits.org/), en español, sin tildes en el asunto:

```
feat: alta y edicion de clientes con asignacion a vendedor
fix: filtrar cartera por vendedor en el backend
docs: agregar decisiones de arquitectura
chore: pipeline de deploy
```

Commit cada vez que algo empieza a funcionar. Un historial que cuenta una historia vale para la evaluación.

### Idioma

- **Dominio en español**: `clientes`, `interacciones`, `oportunidades`, `vendedor_id`
- **Técnico en inglés**: `id`, `created`, nombres de tipos de TypeScript
- Comentarios y textos de interfaz en español

### Antes de dar algo por terminado

1. Compila sin errores (`npm run build`)
2. Funciona en la URL de producción, no solo en local
3. Se ve bien en viewport de celular
4. El filtro por rol está verificado en el servidor

---

## 10. Prioridades si falta tiempo

Orden de sacrificio, primero lo que se corta antes:

1. Dashboard del admin
2. Drag & drop en el pipeline → reemplazar por un `<select>` de etapa
3. Múltiples contactos por cliente → un contacto embebido
4. Login real → selector de usuario en la barra

**Nunca se corta:** clientes + bitácora + alerta de inactividad + que funcione en celular.

La pantalla de **clientes en riesgo** es la más importante de la demo. Es el dolor que el cliente describió con más énfasis y técnicamente es lo más barato de construir. Si algo tiene que quedar impecable, es esa.
