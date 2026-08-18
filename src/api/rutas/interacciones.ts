/**
 * Bitacora de contactos con el cliente.
 *
 * Es la tabla que hoy no existe en ningun lado: lo que cada vendedor tiene en
 * la cabeza o en su Excel. El alta tiene que ser barata — cuatro campos, y solo
 * el tipo obligatorio — porque se completa parado en la calle. Si registrar una
 * visita cuesta trabajo, nadie la registra y el sistema no sirve para nada.
 */
import { clienteAccesible, esRespuesta } from '../acceso';
import {
  enteroPositivo,
  error,
  esUnoDe,
  fechaIsoValida,
  json,
  leerBody,
  textoNoVacio,
  textoOpcional,
} from '../http';
import { TIPOS_INTERACCION } from '../reglas';
import type { Contexto, Sesion } from '../tipos';

// ---------------------------------------------------------------------------
//  GET /api/clientes/:id/interacciones
// ---------------------------------------------------------------------------

export async function listarInteracciones(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await clienteAccesible(ctx.env, enteroPositivo(ctx.params['id']), sesion, 'lectura');
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

export async function crearInteraccion(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await clienteAccesible(ctx.env, enteroPositivo(ctx.params['id']), sesion, 'escritura');
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
    if (!fechaIsoValida(valor)) return error('La fecha de la proxima accion tiene que ser AAAA-MM-DD', 400);
    proximaFecha = valor;
  }

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
      textoOpcional(body.resultado),
      textoOpcional(body.notas),
      textoOpcional(body.proxima_accion),
      proximaFecha,
    )
    .run();

  return json({ id: resultado.meta.last_row_id }, 201);
}
