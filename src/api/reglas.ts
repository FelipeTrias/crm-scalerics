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
 * Sale de la fecha del ultimo pedido, no de una estimacion: es un hecho, no un
 * indicio. Los pedidos anulados no cuentan — un pedido que se dio de baja no es
 * una compra.
 *
 * Es una metrica distinta de la de contacto: un cliente puede tener una visita
 * de la semana pasada y no comprar hace ocho meses, que es exactamente el caso
 * que el cliente describio. Por eso las dos se muestran juntas.
 *
 * Antes se usaba como proxy la oportunidad ganada mas reciente, porque no habia
 * tabla de pedidos. La oportunidad sigue existiendo, pero ya no manda: una
 * oportunidad ganada es "le vendi", un pedido es "compro esto".
 */
export const SQL_DIAS_SIN_COMPRA =
  "(SELECT CAST(julianday('now') - julianday(MAX(p.fecha)) AS INTEGER) " +
  'FROM pedidos p ' +
  "WHERE p.cliente_id = c.id AND p.estado <> 'anulado')";

export const ESTADOS_CLIENTE = ['prospecto', 'activo', 'inactivo'] as const;
export const TIPOS_INTERACCION = ['llamada', 'visita', 'whatsapp', 'email'] as const;
export const ETAPAS_OPORTUNIDAD = [
  'nuevo',
  'contactado',
  'presupuesto_enviado',
  'negociacion',
  'ganado',
  'perdido',
] as const;
export const MONEDAS = ['UYU', 'USD'] as const;
