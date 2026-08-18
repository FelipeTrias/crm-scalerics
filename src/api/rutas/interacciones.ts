/**
 * Bitacora de contactos con el cliente.
 *
 * Es la tabla que hoy no existe en ningun lado: lo que cada vendedor tiene en
 * la cabeza o en su Excel. El alta tiene que ser barata — cuatro campos, sin
 * campos obligatorios mas alla del tipo — porque se completa parado en la
 * calle. Si registrar una visita cuesta trabajo, nadie la registra y el
 * sistema no sirve para nada.
 */
import { enteroPositivo, error, esUnoDe, json, leerBody, textoNoVacio } from '../http';
import { esAdmin } from '../permisos';
import { TIPOS_INTERACCION } from '../reglas';
import type { Contexto, Sesion } from '../tipos';

interface ClienteMinimo {
  id: number;
  vendedor_id: number;
}

/**
 * Resuelve el cliente de la ruta comprobando el alcance del usuario.
 *
 * Devuelve una Response cuando hay que cortar, o el cliente cuando se puede
 * seguir. Se distingue a proposito entre lectura y escritura: al leer se
 * responde 404 para no confirmar que el cliente existe, al escribir 403 porque
 * el mensaje le sirve al vendedor para entender que paso.
 */
async function resolverCliente(
  ctx: Contexto,
  sesion: Sesion,
  modo: 'lectura' | 'escritura',
): Promise<ClienteMinimo | Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de cliente invalido', 400);

  const cliente = await ctx.env.DB.prepare('SELECT id, vendedor_id FROM clientes WHERE id = ? AND eliminado = 0')
    .bind(id)
    .first<ClienteMinimo>();

  if (!cliente) return error('Cliente no encontrado', 404);

  if (!esAdmin(sesion) && cliente.vendedor_id !== sesion.id) {
    return modo === 'lectura'
      ? error('Cliente no encontrado', 404)
      : error('Ese cliente no es de tu cartera', 403);
  }

  return cliente;
}

function esRespuesta(x: ClienteMinimo | Response): x is Response {
  return x instanceof Response;
}

// ---------------------------------------------------------------------------
//  GET /api/clientes/:id/interacciones
// ---------------------------------------------------------------------------

export async function listarInteracciones(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await resolverCliente(ctx, sesion, 'lectura');
  if (esRespuesta(cliente)) return cliente;

  const { results } = await ctx.env.DB.prepare(
    'SELECT i.id, i.tipo, i.fecha, i.resultado, i.notas, i.proxima_accion, i.proxima_accion_fecha, ' +
      '       i.usuario_id, u.nombre AS usuario_nombre ' +
      '  FROM interacciones i ' +
      '  JOIN usuarios u ON u.id = i.usuario_id ' +
      ' WHERE i.cliente_id = ? ' +
      ' ORDER BY i.fecha DESC',
  )
    .bind(cliente.id)
    .all();

  return json({ interacciones: results });
}

// ---------------------------------------------------------------------------
//  POST /api/clientes/:id/interacciones
// ---------------------------------------------------------------------------

interface CuerpoInteraccion {
  tipo?: unknown;
  resultado?: unknown;
  notas?: unknown;
  proxima_accion?: unknown;
  proxima_accion_fecha?: unknown;
}

/** Solo acepta YYYY-MM-DD, que es como SQLite compara y ordena bien. */
function fechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(valor + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

export async function crearInteraccion(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await resolverCliente(ctx, sesion, 'escritura');
  if (esRespuesta(cliente)) return cliente;

  const body = await leerBody<CuerpoInteraccion>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  // El unico campo obligatorio. Todo lo demas puede quedar vacio: es preferible
  // un registro incompleto a que el vendedor no registre nada.
  if (!esUnoDe(body.tipo, TIPOS_INTERACCION)) {
    return error('El tipo tiene que ser llamada, visita, whatsapp o email', 400);
  }

  let proximaFecha: string | null = null;
  if (textoNoVacio(body.proxima_accion_fecha)) {
    const valor = body.proxima_accion_fecha.trim();
    if (!fechaValida(valor)) return error('La fecha de la proxima accion tiene que ser AAAA-MM-DD', 400);
    proximaFecha = valor;
  }

  const opcional = (v: unknown): string | null => (textoNoVacio(v) ? v.trim() : null);

  // La interaccion queda a nombre de quien la registra, no del vendedor
  // asignado. Si el dueño llama a un cliente, tiene que verse que llamo el.
  const resultado = await ctx.env.DB.prepare(
    'INSERT INTO interacciones (cliente_id, usuario_id, tipo, resultado, notas, proxima_accion, proxima_accion_fecha) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      cliente.id,
      sesion.id,
      body.tipo,
      opcional(body.resultado),
      opcional(body.notas),
      opcional(body.proxima_accion),
      proximaFecha,
    )
    .run();

  return json({ id: resultado.meta.last_row_id }, 201);
}
