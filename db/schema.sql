-- ============================================================================
--  CRM Scalerics — schema de la base (Cloudflare D1 / SQLite)
--
--  Convenciones:
--    - Fechas como texto ISO 8601 via datetime('now'). Ordenan y comparan bien.
--    - Nada se borra fisicamente: clientes.eliminado = 1 (borrado logico).
--    - ultima_interaccion NO es columna: se calcula con MAX(interacciones.fecha).
--
--  Aplicar:
--    npx wrangler d1 execute scalerics-crm --local  --file=./db/schema.sql
--    npx wrangler d1 execute scalerics-crm --remote --file=./db/schema.sql
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
--  usuarios — el dueño (admin) y los 4 vendedores
-- ---------------------------------------------------------------------------
CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin','vendedor')),
  activo        INTEGER NOT NULL DEFAULT 1,   -- 0 = dado de baja, se le reasigna la cartera
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
--  clientes — la cartera. Es de la empresa, no del vendedor.
-- ---------------------------------------------------------------------------
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
  eliminado       INTEGER NOT NULL DEFAULT 0,   -- borrado logico
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por      INTEGER REFERENCES usuarios(id)
);

-- ---------------------------------------------------------------------------
--  contactos — personas dentro del cliente
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
--  interacciones — la bitacora. Es el activo que hoy se pierde cuando
--  un vendedor se va. Nunca se reasigna: queda apuntando a quien la registro.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
--  oportunidades — el pipeline. fecha_cierre_real sobre etapa 'ganado'
--  es el proxy de "ultima compra" (ver CLAUDE.md seccion 5).
-- ---------------------------------------------------------------------------
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
  fecha_cierre_real      TEXT,   -- se completa al pasar a 'ganado' o 'perdido'
  motivo_perdida         TEXT,
  creado_en              TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
--  alertas — lo que genera el cron diario. Es el registro de que se aviso,
--  no la fuente de la pantalla de clientes en riesgo (esa sale de la query).
-- ---------------------------------------------------------------------------
CREATE TABLE alertas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id         INTEGER NOT NULL REFERENCES clientes(id),
  vendedor_id        INTEGER NOT NULL REFERENCES usuarios(id),
  tipo               TEXT NOT NULL DEFAULT 'sin_contacto'
                     CHECK (tipo IN ('sin_contacto','sin_compra','oportunidad_estancada')),
  dias_sin_contacto  INTEGER,
  mensaje            TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','vista','resuelta')),
  generada_en        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
--  Indices
-- ---------------------------------------------------------------------------

-- Listado de cartera por vendedor, filtrando los borrados logicos.
CREATE INDEX idx_clientes_vendedor      ON clientes(vendedor_id, eliminado);

-- Cubre el MAX(fecha) por cliente, que es como se calculan los dias sin contacto.
CREATE INDEX idx_interacciones_cliente  ON interacciones(cliente_id, fecha DESC);

-- Pipeline agrupado por etapa.
CREATE INDEX idx_oportunidades_etapa    ON oportunidades(etapa, vendedor_id);

-- Campanita de alertas pendientes del usuario.
CREATE INDEX idx_alertas_estado         ON alertas(estado, vendedor_id);

-- El cron corre todos los dias: esto impide que cree dos veces
-- la misma alerta pendiente para el mismo cliente.
CREATE UNIQUE INDEX idx_alertas_sin_duplicar
  ON alertas(cliente_id, tipo) WHERE estado = 'pendiente';
