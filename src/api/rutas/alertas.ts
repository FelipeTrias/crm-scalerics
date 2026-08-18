/**
 * Alertas generadas por el cron.
 *
 * Ojo con la distincion: la pantalla de clientes en riesgo se arma con la
 * consulta de dias (GET /api/clientes?riesgo=true), en vivo. Esta tabla es el
 * registro de que al vendedor ya se le aviso, y es lo que alimenta la
 * campanita. Son dos cosas distintas y conviene que sigan siendolo: una
 * responde "quien esta en riesgo hoy", la otra "de que ya se le aviso".
 *
 * El motor que las crea vive en el paso del cron; aca solo se leen y se marcan.
 */
import { enteroPositivo, error, esUnoDe, json, leerBody } from '../http';
import { esAdmin, filtroPorVendedor } from '../permisos';
import type { Contexto, Sesion } from '../tipos';

const ESTADOS_ALERTA = ['pendiente', 'vista', 'resuelta'] as const;

/** Solo se puede marcar hacia adelante: 'pendiente' no es un destino valido. */
const ESTADOS_DESTINO = ['vista', 'resuelta'] as const;

// ---------------------------------------------------------------------------
//  GET /api/alertas
// ---------------------------------------------------------------------------

export async function listarAlertas(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const condiciones: string[] = ['c.eliminado = 0'];
  const params: unknown[] = [];

  const alcance = filtroPorVendedor(sesion, ctx.url, 'a.vendedor_id');
  if (alcance.sql) {
    condiciones.push(alcance.sql);
    params.push(...alcance.params);
  }

  // Por defecto solo las pendientes: es lo que el vendedor tiene que atender.
  const estado = ctx.url.searchParams.get('estado') ?? 'pendiente';
  if (estado !== 'todas') {
    if (!esUnoDe(estado, ESTADOS_ALERTA)) return error('Estado de alerta invalido', 400);
    condiciones.push('a.estado = ?');
    params.push(estado);
  }

  const { results } = await ctx.env.DB.prepare(
    'SELECT a.id, a.cliente_id, c.razon_social, c.nombre_fantasia, ' +
      '       a.vendedor_id, u.nombre AS vendedor_nombre, ' +
      '       a.tipo, a.dias_sin_contacto, a.mensaje, a.estado, a.generada_en, ' +
      // El telefono del contacto principal viene en la misma consulta para que
      // el boton de WhatsApp no necesite un pedido extra.
      '       (SELECT ct.whatsapp FROM contactos ct WHERE ct.cliente_id = c.id ' +
      '         ORDER BY ct.es_principal DESC, ct.id LIMIT 1) AS whatsapp ' +
      '  FROM alertas a ' +
      '  JOIN clientes c ON c.id = a.cliente_id ' +
      '  JOIN usuarios u ON u.id = a.vendedor_id ' +
      ' WHERE ' + condiciones.join(' AND ') +
      ' ORDER BY a.dias_sin_contacto DESC, a.generada_en DESC',
  )
    .bind(...params)
    .all();

  return json({ alertas: results });
}

// ---------------------------------------------------------------------------
//  PATCH /api/alertas/:id
// ---------------------------------------------------------------------------

export async function editarAlerta(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de alerta invalido', 400);

  const body = await leerBody<{ estado?: unknown }>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);
  if (!esUnoDe(body.estado, ESTADOS_DESTINO)) {
    return error("El estado tiene que ser 'vista' o 'resuelta'", 400);
  }

  const alerta = await ctx.env.DB.prepare('SELECT id, vendedor_id FROM alertas WHERE id = ?')
    .bind(id)
    .first<{ id: number; vendedor_id: number }>();

  if (!alerta) return error('Alerta no encontrada', 404);
  if (!esAdmin(sesion) && alerta.vendedor_id !== sesion.id) {
    return error('Esa alerta no es tuya', 403);
  }

  await ctx.env.DB.prepare('UPDATE alertas SET estado = ? WHERE id = ?').bind(body.estado, id).run();

  return json({ ok: true });
}
