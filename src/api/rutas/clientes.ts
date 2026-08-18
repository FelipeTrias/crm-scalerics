/**
 * Endpoints de clientes: la cartera.
 *
 * Todas las consultas de este archivo arrancan con el filtro de alcance de
 * permisos.ts. Es deliberado que sea lo primero que se agrega al WHERE.
 */
import { enteroPositivo, error, esUnoDe, json, leerBody, textoNoVacio } from '../http';
import { escaparLike, esAdmin, filtroPorVendedor } from '../permisos';
import {
  DIAS_SIN_COMPRA_RIESGO,
  DIAS_SIN_CONTACTO_RIESGO,
  ESTADOS_CLIENTE,
  SQL_DIAS_SIN_COMPRA,
  SQL_DIAS_SIN_CONTACTO,
} from '../reglas';
import type { Contexto, Sesion } from '../tipos';

interface FilaCliente {
  id: number;
  razon_social: string;
  nombre_fantasia: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  rubro: string | null;
  estado: string;
  notas: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  dias_sin_contacto: number;
  dias_sin_compra: number | null;
  ultima_interaccion: string | null;
}

// ---------------------------------------------------------------------------
//  GET /api/clientes
// ---------------------------------------------------------------------------

export async function listarClientes(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const condiciones: string[] = ['c.eliminado = 0'];
  const params: unknown[] = [];

  const alcance = filtroPorVendedor(sesion, ctx.url, 'c.vendedor_id');
  if (alcance.sql) {
    condiciones.push(alcance.sql);
    params.push(...alcance.params);
  }

  const estado = ctx.url.searchParams.get('estado');
  if (estado) {
    if (!esUnoDe(estado, ESTADOS_CLIENTE)) return error('Estado de cliente invalido', 400);
    condiciones.push('c.estado = ?');
    params.push(estado);
  }

  const q = ctx.url.searchParams.get('q');
  if (q && q.trim()) {
    const patron = '%' + escaparLike(q.trim()) + '%';
    condiciones.push(
      "(c.razon_social LIKE ? ESCAPE '\\' OR c.nombre_fantasia LIKE ? ESCAPE '\\' OR c.rut LIKE ? ESCAPE '\\')",
    );
    params.push(patron, patron, patron);
  }

  // La pantalla de clientes en riesgo pide las dos causas juntas: los que hace
  // mucho que no se contactan y los que hace mucho que no compran.
  const soloRiesgo = ctx.url.searchParams.get('riesgo') === 'true';
  let having = '';
  if (soloRiesgo) {
    having = 'HAVING dias_sin_contacto > ? OR dias_sin_compra > ?';
    params.push(DIAS_SIN_CONTACTO_RIESGO, DIAS_SIN_COMPRA_RIESGO);
  }

  // `prioridad` existe para poder ordenar la pantalla de riesgo por la peor de
  // las dos causas. Sin esto, un cliente que compro hace 8 meses pero se llamo
  // ayer quedaria al fondo de la lista, que es justo el caso que hay que ver.
  const orden = soloRiesgo ? 'ORDER BY prioridad DESC' : 'ORDER BY c.razon_social COLLATE NOCASE';

  const sql =
    'SELECT c.id, c.razon_social, c.nombre_fantasia, c.rut, c.direccion, c.ciudad, c.rubro, ' +
    '       c.estado, c.notas, c.vendedor_id, u.nombre AS vendedor_nombre, ' +
    '       MAX(i.fecha) AS ultima_interaccion, ' +
    '       ' + SQL_DIAS_SIN_CONTACTO + ' AS dias_sin_contacto, ' +
    '       ' + SQL_DIAS_SIN_COMPRA + ' AS dias_sin_compra, ' +
    '       max(' + SQL_DIAS_SIN_CONTACTO + ', COALESCE(' + SQL_DIAS_SIN_COMPRA + ', 0)) AS prioridad ' +
    '  FROM clientes c ' +
    '  JOIN usuarios u ON u.id = c.vendedor_id ' +
    '  LEFT JOIN interacciones i ON i.cliente_id = c.id ' +
    ' WHERE ' + condiciones.join(' AND ') +
    ' GROUP BY c.id ' + having + ' ' + orden;

  const { results } = await ctx.env.DB.prepare(sql)
    .bind(...params)
    .all<FilaCliente>();

  return json({ clientes: results });
}

// ---------------------------------------------------------------------------
//  GET /api/clientes/:id
// ---------------------------------------------------------------------------

export async function verCliente(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de cliente invalido', 400);

  const condiciones = ['c.id = ?', 'c.eliminado = 0'];
  const params: unknown[] = [id];

  const alcance = filtroPorVendedor(sesion, ctx.url, 'c.vendedor_id');
  if (alcance.sql) {
    condiciones.push(alcance.sql);
    params.push(...alcance.params);
  }

  const cliente = await ctx.env.DB.prepare(
    'SELECT c.id, c.razon_social, c.nombre_fantasia, c.rut, c.direccion, c.ciudad, c.rubro, ' +
      '       c.estado, c.notas, c.vendedor_id, u.nombre AS vendedor_nombre, ' +
      '       MAX(i.fecha) AS ultima_interaccion, ' +
      '       ' + SQL_DIAS_SIN_CONTACTO + ' AS dias_sin_contacto, ' +
      '       ' + SQL_DIAS_SIN_COMPRA + ' AS dias_sin_compra ' +
      '  FROM clientes c ' +
      '  JOIN usuarios u ON u.id = c.vendedor_id ' +
      '  LEFT JOIN interacciones i ON i.cliente_id = c.id ' +
      ' WHERE ' + condiciones.join(' AND ') +
      ' GROUP BY c.id',
  )
    .bind(...params)
    .first<FilaCliente>();

  // 404 y no 403: un 403 confirmaria que el cliente existe y de quien es.
  if (!cliente) return error('Cliente no encontrado', 404);

  const [contactos, interacciones, oportunidades] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'SELECT id, nombre, cargo, telefono, whatsapp, email, es_principal ' +
        'FROM contactos WHERE cliente_id = ? ORDER BY es_principal DESC, id',
    ).bind(id),
    ctx.env.DB.prepare(
      'SELECT i.id, i.tipo, i.fecha, i.resultado, i.notas, i.proxima_accion, i.proxima_accion_fecha, ' +
        '       i.usuario_id, u.nombre AS usuario_nombre ' +
        '  FROM interacciones i JOIN usuarios u ON u.id = i.usuario_id ' +
        ' WHERE i.cliente_id = ? ORDER BY i.fecha DESC LIMIT 50',
    ).bind(id),
    ctx.env.DB.prepare(
      'SELECT id, titulo, monto_estimado, moneda, etapa, fecha_cierre_estimada, fecha_cierre_real, motivo_perdida ' +
        'FROM oportunidades WHERE cliente_id = ? ORDER BY creado_en DESC',
    ).bind(id),
  ]);

  return json({
    cliente,
    contactos: contactos.results,
    interacciones: interacciones.results,
    oportunidades: oportunidades.results,
  });
}

// ---------------------------------------------------------------------------
//  POST /api/clientes
// ---------------------------------------------------------------------------

interface CuerpoCliente {
  razon_social?: unknown;
  nombre_fantasia?: unknown;
  rut?: unknown;
  direccion?: unknown;
  ciudad?: unknown;
  rubro?: unknown;
  estado?: unknown;
  notas?: unknown;
  vendedor_id?: unknown;
}

/** Devuelve el texto recortado, o null si vino vacio o no es texto. */
function opcional(valor: unknown): string | null {
  return textoNoVacio(valor) ? valor.trim() : null;
}

async function esVendedorValido(ctx: Contexto, id: number): Promise<boolean> {
  const fila = await ctx.env.DB.prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'vendedor' AND activo = 1")
    .bind(id)
    .first<{ id: number }>();
  return fila !== null;
}

export async function crearCliente(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const body = await leerBody<CuerpoCliente>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);
  if (!textoNoVacio(body.razon_social)) return error('La razon social es obligatoria', 400);

  const estado = body.estado === undefined || body.estado === null ? 'activo' : body.estado;
  if (!esUnoDe(estado, ESTADOS_CLIENTE)) return error('Estado de cliente invalido', 400);

  // Un vendedor solo puede darse de alta clientes a si mismo. El vendedor_id
  // del body se ignora: si se respetara, un vendedor podria asignarse clientes
  // ajenos con un simple curl.
  let vendedorId = sesion.id;
  if (esAdmin(sesion)) {
    const pedido = enteroPositivo(body.vendedor_id);
    if (!pedido) return error('Hay que indicar a que vendedor se asigna el cliente', 400);
    if (!(await esVendedorValido(ctx, pedido))) return error('El vendedor indicado no existe o esta dado de baja', 400);
    vendedorId = pedido;
  }

  const resultado = await ctx.env.DB.prepare(
    'INSERT INTO clientes (razon_social, nombre_fantasia, rut, direccion, ciudad, rubro, vendedor_id, estado, notas, creado_por) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      body.razon_social.trim(),
      opcional(body.nombre_fantasia),
      opcional(body.rut),
      opcional(body.direccion),
      opcional(body.ciudad),
      opcional(body.rubro),
      vendedorId,
      estado,
      opcional(body.notas),
      sesion.id,
    )
    .run();

  return json({ id: resultado.meta.last_row_id }, 201);
}

// ---------------------------------------------------------------------------
//  PATCH /api/clientes/:id
// ---------------------------------------------------------------------------

const CAMPOS_EDITABLES = ['razon_social', 'nombre_fantasia', 'rut', 'direccion', 'ciudad', 'rubro', 'notas'] as const;

export async function editarCliente(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de cliente invalido', 400);

  const body = await leerBody<CuerpoCliente>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  const actual = await ctx.env.DB.prepare('SELECT id, vendedor_id FROM clientes WHERE id = ? AND eliminado = 0')
    .bind(id)
    .first<{ id: number; vendedor_id: number }>();
  if (!actual) return error('Cliente no encontrado', 404);
  if (!esAdmin(sesion) && actual.vendedor_id !== sesion.id) {
    return error('Ese cliente no es de tu cartera', 403);
  }

  const asignaciones: string[] = [];
  const params: unknown[] = [];

  for (const campo of CAMPOS_EDITABLES) {
    if (body[campo] === undefined) continue;
    asignaciones.push(campo + ' = ?');
    params.push(opcional(body[campo]));
  }

  if (body.estado !== undefined) {
    if (!esUnoDe(body.estado, ESTADOS_CLIENTE)) return error('Estado de cliente invalido', 400);
    asignaciones.push('estado = ?');
    params.push(body.estado);
  }

  // Reasignar la cartera es potestad del dueño, no del vendedor.
  if (body.vendedor_id !== undefined) {
    if (!esAdmin(sesion)) return error('Solo el administrador puede cambiar el vendedor asignado', 403);
    const nuevo = enteroPositivo(body.vendedor_id);
    if (!nuevo) return error('Vendedor invalido', 400);
    if (!(await esVendedorValido(ctx, nuevo))) return error('El vendedor indicado no existe o esta dado de baja', 400);
    asignaciones.push('vendedor_id = ?');
    params.push(nuevo);
  }

  if (asignaciones.length === 0) return error('No hay nada para modificar', 400);

  if (asignaciones.some((a) => a.startsWith('razon_social')) && !textoNoVacio(body.razon_social)) {
    return error('La razon social no puede quedar vacia', 400);
  }

  params.push(id);
  await ctx.env.DB.prepare('UPDATE clientes SET ' + asignaciones.join(', ') + ' WHERE id = ?')
    .bind(...params)
    .run();

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  DELETE /api/clientes/:id  -> borrado logico
// ---------------------------------------------------------------------------

export async function eliminarCliente(ctx: Contexto, sesion: Sesion): Promise<Response> {
  if (!esAdmin(sesion)) return error('Solo el administrador puede dar de baja un cliente', 403);

  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de cliente invalido', 400);

  // Nunca se borra fisicamente: la bitacora del cliente es el activo que la
  // empresa no quiere perder.
  const resultado = await ctx.env.DB.prepare('UPDATE clientes SET eliminado = 1 WHERE id = ? AND eliminado = 0')
    .bind(id)
    .run();

  if (resultado.meta.changes === 0) return error('Cliente no encontrado', 404);
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
//  POST /api/clientes/reasignar
// ---------------------------------------------------------------------------

interface CuerpoReasignar {
  /** Lista explicita de clientes a mover. */
  cliente_ids?: unknown;
  /** O bien: mover la cartera entera de un vendedor. */
  vendedor_origen?: unknown;
  vendedor_destino?: unknown;
}

/**
 * Mueve clientes de un vendedor a otro.
 *
 * Este endpoint es la respuesta a "si un vendedor se va, se lleva los contactos
 * y perdemos el cliente". Lo que se mueve y lo que no es deliberado:
 *
 *   - clientes: cambian de vendedor
 *   - oportunidades ABIERTAS: siguen al cliente, porque hay que trabajarlas
 *   - oportunidades cerradas: se quedan con quien las vendio, es el historico
 *   - interacciones: NUNCA se tocan, siguen a nombre de quien las registro
 *
 * La bitacora es de la empresa y no se reescribe. Esa es toda la idea.
 */
export async function reasignarCartera(ctx: Contexto, sesion: Sesion): Promise<Response> {
  if (!esAdmin(sesion)) return error('Solo el administrador puede reasignar cartera', 403);

  const body = await leerBody<CuerpoReasignar>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  const destino = enteroPositivo(body.vendedor_destino);
  if (!destino) return error('Hay que indicar el vendedor destino', 400);
  if (!(await esVendedorValido(ctx, destino))) {
    return error('El vendedor destino no existe o esta dado de baja', 400);
  }

  const condiciones = ['eliminado = 0', 'vendedor_id <> ?'];
  const params: unknown[] = [destino];

  if (Array.isArray(body.cliente_ids) && body.cliente_ids.length > 0) {
    if (body.cliente_ids.length > 500) return error('No se pueden reasignar mas de 500 clientes por vez', 400);
    const ids = body.cliente_ids.map(enteroPositivo);
    if (ids.some((x) => x === null)) return error('La lista de clientes tiene ids invalidos', 400);
    condiciones.push('id IN (' + ids.map(() => '?').join(', ') + ')');
    params.push(...ids);
  } else {
    const origen = enteroPositivo(body.vendedor_origen);
    if (!origen) return error('Hay que indicar cliente_ids o vendedor_origen', 400);
    if (origen === destino) return error('El vendedor de origen y el de destino son el mismo', 400);
    condiciones.push('vendedor_id = ?');
    params.push(origen);
  }

  // Se resuelve primero que clientes se mueven y recien despues se actualiza.
  // Si se actualizara directo por vendedor_origen, la segunda consulta (la de
  // oportunidades) ya no encontraria nada: los clientes habrian cambiado de
  // dueño en el paso anterior.
  const { results } = await ctx.env.DB.prepare(
    'SELECT id FROM clientes WHERE ' + condiciones.join(' AND '),
  )
    .bind(...params)
    .all<{ id: number }>();

  const ids = results.map((r) => r.id);
  if (ids.length === 0) return json({ clientes_reasignados: 0, oportunidades_reasignadas: 0 });

  const marcadores = ids.map(() => '?').join(', ');
  const [clientes, oportunidades] = await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE clientes SET vendedor_id = ? WHERE id IN (' + marcadores + ')').bind(destino, ...ids),
    ctx.env.DB.prepare(
      "UPDATE oportunidades SET vendedor_id = ?, actualizado_en = datetime('now') " +
        ' WHERE cliente_id IN (' + marcadores + ')' +
        "   AND etapa NOT IN ('ganado', 'perdido')",
    ).bind(destino, ...ids),
  ]);

  return json({
    clientes_reasignados: clientes.meta.changes,
    oportunidades_reasignadas: oportunidades.meta.changes,
  });
}
