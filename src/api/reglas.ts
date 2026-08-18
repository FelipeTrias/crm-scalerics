/**
 * Las reglas de negocio que se repiten en varias consultas, en un solo lugar.
 *
 * Los umbrales y las expresiones SQL viven aca porque los usan el listado de
 * clientes, la pantalla de riesgo y el motor de alertas del cron. Si estuvieran
 * copiados en cada lugar, tarde o temprano uno diria 60 y otro 90.
 */

/** Semaforo de contacto: verde < 30, amarillo 30-60, rojo > 60. */
export const DIAS_SIN_CONTACTO_RIESGO = 60;

/**
 * Umbral de "dejo de comprar". Mas alto que el de contacto a proposito: dejar
 * de comprar un mes es normal, medio año no.
 */
export const DIAS_SIN_COMPRA_RIESGO = 180;

/**
 * Dias desde la ultima interaccion. Requiere `LEFT JOIN interacciones i` y
 * `GROUP BY c.id` en la consulta que la use.
 *
 * Si el cliente nunca tuvo una interaccion se toma su fecha de alta: un cliente
 * cargado hace ocho meses y nunca contactado tambien esta en riesgo.
 */
export const SQL_DIAS_SIN_CONTACTO =
  "CAST(julianday('now') - julianday(COALESCE(MAX(i.fecha), c.creado_en)) AS INTEGER)";

/**
 * Dias desde la ultima compra. Devuelve NULL si el cliente nunca compro.
 *
 * Sale de la fecha del ultimo pedido confirmado o entregado. Un presupuesto no
 * cuenta (todavia no compro), y uno perdido o anulado tampoco.
 *
 * Es una metrica distinta de la de contacto: un cliente puede tener una visita
 * de la semana pasada y no comprar hace ocho meses, que es exactamente el caso
 * que el cliente describio. Por eso las dos se muestran juntas.
 *
 * Antes de que existieran los pedidos esto se estimaba con la oportunidad
 * ganada mas reciente. Las oportunidades ya no existen: un presupuesto es un
 * pedido sin confirmar, y la venta es el mismo registro un estado mas adelante.
 */
export const SQL_DIAS_SIN_COMPRA =
  "(SELECT CAST(julianday('now') - julianday(MAX(p.fecha)) AS INTEGER) " +
  'FROM pedidos p ' +
  "WHERE p.cliente_id = c.id AND p.estado IN ('confirmado','entregado'))";

export const ESTADOS_CLIENTE = ['prospecto', 'activo', 'inactivo'] as const;
export const TIPOS_INTERACCION = ['llamada', 'visita', 'whatsapp', 'email'] as const;
export const MONEDAS = ['UYU', 'USD'] as const;

/**
 * Total de un pedido. No se guarda: se calcula sumando los renglones.
 *
 * Mismo criterio que "dias sin contacto" — no guardar lo que se puede derivar,
 * porque tarde o temprano se desincroniza. Los precios ya quedaron congelados
 * en cada renglon al momento de la venta, asi que la suma es estable.
 *
 * Espera que la consulta tenga la tabla `pedidos` con alias `p`.
 */
export const SQL_TOTAL_PEDIDO =
  '(SELECT COALESCE(SUM(i.cantidad * i.precio_unitario), 0) ' +
  'FROM pedido_items i WHERE i.pedido_id = p.id)';

/**
 * Estados de un pedido. Un presupuesto es un pedido que todavia no se confirmo.
 *
 *     presupuesto  ->  confirmado  ->  entregado
 *          |               |
 *       perdido         anulado
 */
export const ESTADOS_PEDIDO = ['presupuesto', 'confirmado', 'entregado', 'perdido', 'anulado'] as const;

/** Los unicos estados que significan que el cliente compro. */
export const ESTADOS_VENDIDOS = "('confirmado','entregado')";
