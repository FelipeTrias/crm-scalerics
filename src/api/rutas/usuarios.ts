/**
 * Vendedores y bajas.
 *
 * Junto con POST /api/clientes/reasignar (en clientes.ts), estos endpoints son
 * la respuesta concreta a la primera frase del cliente: "si un vendedor se va,
 * se lleva los contactos y perdemos el cliente".
 *
 * El orden correcto es reasignar primero y dar de baja despues. Se hace
 * cumplir: dar de baja un vendedor con cartera asignada devuelve 409, porque si
 * no la cartera quedaria colgando de alguien que ya no trabaja en la empresa.
 */
import { enteroPositivo, error, json, leerBody } from '../http';
import { esAdmin } from '../permisos';
import type { Contexto, Sesion } from '../tipos';

// ---------------------------------------------------------------------------
//  GET /api/vendedores
// ---------------------------------------------------------------------------

export async function listarVendedores(ctx: Contexto, sesion: Sesion): Promise<Response> {
  if (!esAdmin(sesion)) return error('Solo el administrador puede ver la lista de vendedores', 403);

  const { results } = await ctx.env.DB.prepare(
    'SELECT u.id, u.nombre, u.email, u.activo, ' +
      '       (SELECT COUNT(*) FROM clientes c WHERE c.vendedor_id = u.id AND c.eliminado = 0) AS clientes ' +
      "  FROM usuarios u WHERE u.rol = 'vendedor' " +
      ' ORDER BY u.activo DESC, u.nombre COLLATE NOCASE',
  ).all();

  return json({ vendedores: results });
}

// ---------------------------------------------------------------------------
//  PATCH /api/usuarios/:id
// ---------------------------------------------------------------------------

export async function editarUsuario(ctx: Contexto, sesion: Sesion): Promise<Response> {
  if (!esAdmin(sesion)) return error('Solo el administrador puede dar de alta o de baja usuarios', 403);

  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de usuario invalido', 400);

  const body = await leerBody<{ activo?: unknown }>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);
  if (body.activo !== 0 && body.activo !== 1) return error('El campo activo tiene que ser 0 o 1', 400);

  // Sin esto, el dueño puede dejarse afuera del sistema con un solo pedido.
  if (id === sesion.id) return error('No podes darte de baja a vos mismo', 400);

  const usuario = await ctx.env.DB.prepare('SELECT id, nombre, activo FROM usuarios WHERE id = ?')
    .bind(id)
    .first<{ id: number; nombre: string; activo: number }>();
  if (!usuario) return error('Usuario no encontrado', 404);

  if (body.activo === 0) {
    const cartera = await ctx.env.DB.prepare(
      'SELECT COUNT(*) AS clientes FROM clientes WHERE vendedor_id = ? AND eliminado = 0',
    )
      .bind(id)
      .first<{ clientes: number }>();

    if (cartera && cartera.clientes > 0) {
      return error(
        'Ese vendedor todavia tiene ' + cartera.clientes + ' clientes asignados. ' +
          'Reasigna su cartera antes de darlo de baja.',
        409,
      );
    }
  }

  await ctx.env.DB.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').bind(body.activo, id).run();

  return json({ ok: true });
}
