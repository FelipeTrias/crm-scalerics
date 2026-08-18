-- ============================================================================
--  Migracion 001 — productos y pedidos
--
--  El proyecto no tiene sistema de migraciones: el esquema se aplica entero
--  desde db/schema.sql. Como estas tablas se agregaron con bases ya cargadas
--  en local y en produccion, hizo falta este archivo aparte.
--
--  Es aditivo: no toca ni borra nada de lo que ya existia.
--
--  Aplicar:
--    npx wrangler d1 execute scalerics-crm --local  --file=./db/migraciones/001-pedidos.sql
--    npx wrangler d1 execute scalerics-crm --remote --file=./db/migraciones/001-pedidos.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
--  productos — el catalogo que vende Scalerics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  unidad        TEXT NOT NULL,          -- bidon 5L, paquete x100, caja, unidad
  precio_lista  REAL NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
--  pedidos — lo que el cliente compro de verdad
--
--  Un pedido no es una factura: no hay impuestos, remito ni cuenta corriente.
--  Es el registro comercial de que hubo una venta, con que y cuando.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  -- A quien se le acredita la venta: sigue al vendedor del cliente, igual que
  -- las oportunidades. Distinto de creado_por, que es quien lo tecleo.
  vendedor_id  INTEGER NOT NULL REFERENCES usuarios(id),
  fecha        TEXT NOT NULL DEFAULT (date('now')),
  estado       TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','entregado','anulado')),
  notas        TEXT,
  creado_por   INTEGER REFERENCES usuarios(id),
  creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
--  pedido_items — los renglones
--
--  precio_unitario se COPIA del catalogo al momento de la venta, no se lee de
--  productos. Si el hipoclorito sube de 850 a 920, un pedido de marzo tiene que
--  seguir diciendo 850: si el renglon apuntara al precio actual, actualizar una
--  lista de precios reescribiria todo el historial de ventas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id        INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id      INTEGER NOT NULL REFERENCES productos(id),
  cantidad         REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario  REAL NOT NULL CHECK (precio_unitario >= 0)
);

-- El total del pedido NO se guarda: sale de SUM(cantidad * precio_unitario).
-- Mismo criterio que "dias sin contacto" — no guardar lo que se puede derivar,
-- porque se desincroniza. Los precios ya quedaron congelados en los renglones,
-- asi que la suma es estable.

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente      ON pedidos(cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor     ON pedidos(vendedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido  ON pedido_items(pedido_id);
