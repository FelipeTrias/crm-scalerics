-- ============================================================================
--  Migracion 002 — el presupuesto y el pedido pasan a ser la misma cosa
--
--  Antes habia dos entidades que se pisaban:
--
--    oportunidades  titulo libre + monto tipeado a mano + 6 etapas
--    pedidos        renglones reales + 3 estados
--
--  Para el vendedor eran dos pantallas distintas para el mismo trabajo, y el
--  monto de la oportunidad no salia de ningun lado: en el pipeline se veian
--  presupuestos de $123.000 para clientes que compran $20.000.
--
--  Ahora hay una sola: un presupuesto es un pedido que todavia no se confirmo.
--  Se arma la lista de productos una vez y despues solo cambia de estado.
--
--      presupuesto  →  confirmado  →  entregado
--           ↓              ↓
--        perdido        anulado
--
--  ATENCION: esta migracion BORRA los pedidos existentes y elimina la tabla
--  oportunidades. Se puede hacer porque todavia no hay datos reales — solo los
--  de prueba, que se regeneran con db/seed.sql. Con datos de produccion habria
--  que convertir cada oportunidad abierta en un presupuesto a mano.
--
--  Aplicar:
--    npx wrangler d1 execute scalerics-crm --local  --file=./db/migraciones/002-presupuestos.sql
--    npx wrangler d1 execute scalerics-crm --remote --file=./db/migraciones/002-presupuestos.sql
--    y despues volver a aplicar db/seed.sql
-- ============================================================================

-- Los hijos primero: pedido_items tiene clave foranea contra pedidos.
DELETE FROM pedido_items;
DELETE FROM pedidos;

DROP TABLE IF EXISTS pedidos;

CREATE TABLE pedidos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
  -- A quien se le acredita: sigue al vendedor del cliente. Distinto de
  -- creado_por, que es quien lo tecleo.
  vendedor_id  INTEGER NOT NULL REFERENCES usuarios(id),
  fecha        TEXT NOT NULL DEFAULT (date('now')),
  estado       TEXT NOT NULL DEFAULT 'presupuesto'
               CHECK (estado IN ('presupuesto','confirmado','entregado','perdido','anulado')),
  -- Cuando se pierde un presupuesto, aca va el motivo.
  notas        TEXT,
  creado_por   INTEGER REFERENCES usuarios(id),
  creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pedidos_cliente  ON pedidos(cliente_id, fecha DESC);
CREATE INDEX idx_pedidos_vendedor ON pedidos(vendedor_id, fecha DESC);
CREATE INDEX idx_pedidos_estado   ON pedidos(estado, fecha DESC);

-- Ya no existe: lo que era una oportunidad abierta ahora es un pedido en
-- estado 'presupuesto', y con renglones de verdad.
DROP TABLE IF EXISTS oportunidades;
