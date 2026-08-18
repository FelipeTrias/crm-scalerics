/**
 * Contactos dentro de cada cliente empresa.
 *
 * Son las personas con nombre y telefono: el encargado de compras, el de
 * mantenimiento. Es la parte de la cartera que hoy vive en la agenda del
 * celular del vendedor y que se va con el cuando renuncia.
 */
import { clienteAccesible, esRespuesta } from '../acceso';
import { enteroPositivo, error, json, leerBody, textoNoVacio, textoOpcional } from '../http';
import type { Contexto, Sesion } from '../tipos';

interface CuerpoContacto {
  nombre?: unknown;
  cargo?: unknown;
  telefono?: unknown;
  whatsapp?: unknown;
  email?: unknown;
  es_principal?: unknown;
}

function quierePrincipal(valor: unknown): boolean {
  return valor === 1 || valor === true;
}

// ---------------------------------------------------------------------------
//  POST /api/clientes/:id/contactos
// ---------------------------------------------------------------------------

export async function crearContacto(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await clienteAccesible(ctx.env, enteroPositivo(ctx.params['id']), sesion, 'escritura');
  if (esRespuesta(cliente)) return cliente;

  const body = await leerBody<CuerpoContacto>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);
  if (!textoNoVacio(body.nombre)) return error('El nombre del contacto es obligatorio', 400);

  const cuantos = await ctx.env.DB.prepare('SELECT COUNT(*) AS total FROM contactos WHERE cliente_id = ?')
    .bind(cliente.id)
    .first<{ total: number }>();

  // El primer contacto que se carga queda como principal sin que nadie tenga
  // que marcarlo: si no, el boton de WhatsApp no sabria a quien escribirle.
  const principal = quierePrincipal(body.es_principal) || (cuantos?.total ?? 0) === 0;

  const insertar = ctx.env.DB.prepare(
    'INSERT INTO contactos (cliente_id, nombre, cargo, telefono, whatsapp, email, es_principal) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    cliente.id,
    body.nombre.trim(),
    textoOpcional(body.cargo),
    textoOpcional(body.telefono),
    textoOpcional(body.whatsapp),
    textoOpcional(body.email),
    principal ? 1 : 0,
  );

  if (!principal) {
    const resultado = await insertar.run();
    return json({ id: resultado.meta.last_row_id }, 201);
  }

  // Solo puede haber un principal por cliente: se bajan los demas primero.
  const [, insertado] = await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE contactos SET es_principal = 0 WHERE cliente_id = ?').bind(cliente.id),
    insertar,
  ]);

  return json({ id: insertado.meta.last_row_id }, 201);
}

// ---------------------------------------------------------------------------
//  PATCH /api/contactos/:id
// ---------------------------------------------------------------------------

const CAMPOS_EDITABLES = ['nombre', 'cargo', 'telefono', 'whatsapp', 'email'] as const;

export async function editarContacto(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de contacto invalido', 400);

  const body = await leerBody<CuerpoContacto>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  const contacto = await ctx.env.DB.prepare('SELECT id, cliente_id FROM contactos WHERE id = ?')
    .bind(id)
    .first<{ id: number; cliente_id: number }>();
  if (!contacto) return error('Contacto no encontrado', 404);

  // El permiso lo da el cliente al que pertenece, no el contacto en si.
  const cliente = await clienteAccesible(ctx.env, contacto.cliente_id, sesion, 'escritura');
  if (esRespuesta(cliente)) return cliente;

  const asignaciones: string[] = [];
  const params: unknown[] = [];

  for (const campo of CAMPOS_EDITABLES) {
    if (body[campo] === undefined) continue;
    if (campo === 'nombre' && !textoNoVacio(body.nombre)) {
      return error('El nombre del contacto no puede quedar vacio', 400);
    }
    asignaciones.push(campo + ' = ?');
    params.push(textoOpcional(body[campo]));
  }

  const pasaAPrincipal = body.es_principal !== undefined && quierePrincipal(body.es_principal);
  if (pasaAPrincipal) asignaciones.push('es_principal = 1');

  if (asignaciones.length === 0) return error('No hay nada para modificar', 400);

  params.push(id);
  const actualizar = ctx.env.DB.prepare('UPDATE contactos SET ' + asignaciones.join(', ') + ' WHERE id = ?').bind(
    ...params,
  );

  if (!pasaAPrincipal) {
    await actualizar.run();
    return json({ ok: true });
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE contactos SET es_principal = 0 WHERE cliente_id = ? AND id <> ?').bind(
      contacto.cliente_id,
      id,
    ),
    actualizar,
  ]);

  return json({ ok: true });
}
