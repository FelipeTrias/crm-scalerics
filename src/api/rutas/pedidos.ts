/**
 * Catalogo de productos y registro de pedidos.
 *
 * Un pedido es el registro comercial de una venta: que se vendio, cuanto y
 * cuando. No es una factura — no hay impuestos, remito ni cuenta corriente, y
 * eso sigue fuera de alcance.
 *
 * Es la fuente de "dias sin compra" (ver reglas.ts). Antes esa metrica se
 * estimaba con la oportunidad ganada mas reciente; ahora es un hecho.
 *
 * Los pedidos los carga el vendedor sobre sus clientes, o el dueño sobre
 * cualquiera. El cliente no tiene acceso al sistema.
 */
import { clienteAccesible, esRespuesta } from '../acceso';
import { enteroPositivo, error, esUnoDe, fechaIsoValida, json, leerBody, textoNoVacio, textoOpcional } from '../http';
import { esAdmin } from '../permisos';
import { ESTADOS_PEDIDO, SQL_TOTAL_PEDIDO } from '../reglas';
import type { Contexto, Sesion } from '../tipos';

const MAX_RENGLONES = 50;

// ---------------------------------------------------------------------------
//  GET /api/productos
// ---------------------------------------------------------------------------

/** El catalogo lo necesita cualquiera que cargue un pedido, no solo el dueño. */
export async function listarProductos(ctx: Contexto): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, codigo, nombre, categoria, unidad, precio_lista, activo ' +
      '  FROM productos WHERE activo = 1 ' +
      ' ORDER BY categoria, nombre COLLATE NOCASE',
  ).all();

  return json({ productos: results });
}

// ---------------------------------------------------------------------------
//  GET /api/clientes/:id/pedidos
// ---------------------------------------------------------------------------

interface FilaPedido {
  id: number;
  fecha: string;
  estado: string;
  notas: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  total: number;
}

export async function listarPedidos(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await clienteAccesible(ctx.env, enteroPositivo(ctx.params['id']), sesion, 'lectura');
  if (esRespuesta(cliente)) return cliente;

  // Dos consultas y se agrupan en memoria, en vez de una por pedido.
  const [pedidos, renglones] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'SELECT p.id, p.fecha, p.estado, p.notas, p.vendedor_id, u.nombre AS vendedor_nombre, ' +
        '       ' + SQL_TOTAL_PEDIDO + ' AS total ' +
        '  FROM pedidos p JOIN usuarios u ON u.id = p.vendedor_id ' +
        ' WHERE p.cliente_id = ? ' +
        ' ORDER BY p.fecha DESC, p.id DESC',
    ).bind(cliente.id),
    ctx.env.DB.prepare(
      'SELECT i.pedido_id, i.producto_id, pr.codigo, pr.nombre, pr.unidad, ' +
        '       i.cantidad, i.precio_unitario ' +
        '  FROM pedido_items i ' +
        '  JOIN productos pr ON pr.id = i.producto_id ' +
        '  JOIN pedidos p ON p.id = i.pedido_id ' +
        ' WHERE p.cliente_id = ? ' +
        ' ORDER BY i.id',
    ).bind(cliente.id),
  ]);

  const porPedido = new Map<number, unknown[]>();
  for (const r of renglones.results as Array<{ pedido_id: number }>) {
    const lista = porPedido.get(r.pedido_id) ?? [];
    lista.push(r);
    porPedido.set(r.pedido_id, lista);
  }

  const lista = (pedidos.results as FilaPedido[]).map((p) => ({
    ...p,
    items: porPedido.get(p.id) ?? [],
  }));

  return json({ pedidos: lista });
}

// ---------------------------------------------------------------------------
//  POST /api/clientes/:id/pedidos
// ---------------------------------------------------------------------------

interface CuerpoPedido {
  fecha?: unknown;
  estado?: unknown;
  notas?: unknown;
  items?: unknown;
}

interface RenglonPedido {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
}

export async function crearPedido(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const cliente = await clienteAccesible(ctx.env, enteroPositivo(ctx.params['id']), sesion, 'escritura');
  if (esRespuesta(cliente)) return cliente;

  const body = await leerBody<CuerpoPedido>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return error('El pedido tiene que tener al menos un producto', 400);
  }
  if (body.items.length > MAX_RENGLONES) {
    return error('Un pedido no puede tener mas de ' + MAX_RENGLONES + ' renglones', 400);
  }

  const estado = body.estado === undefined || body.estado === null ? 'pendiente' : body.estado;
  if (!esUnoDe(estado, ESTADOS_PEDIDO)) return error('Estado de pedido invalido', 400);

  let fecha: string | null = null;
  if (textoNoVacio(body.fecha)) {
    fecha = body.fecha.trim();
    if (!fechaIsoValida(fecha)) return error('La fecha tiene que ser AAAA-MM-DD', 400);
  }

  // Se traen todos los productos de una vez y se valida contra el catalogo.
  const pedidos = body.items as Array<{ producto_id?: unknown; cantidad?: unknown; precio_unitario?: unknown }>;
  const ids = pedidos.map((r) => enteroPositivo(r.producto_id));
  if (ids.some((x) => x === null)) return error('Hay un producto invalido en el pedido', 400);

  const { results } = await ctx.env.DB.prepare(
    'SELECT id, precio_lista FROM productos WHERE activo = 1 AND id IN (' + ids.map(() => '?').join(', ') + ')',
  )
    .bind(...ids)
    .all<{ id: number; precio_lista: number }>();

  const catalogo = new Map(results.map((p) => [p.id, p.precio_lista]));

  const renglones: RenglonPedido[] = [];
  for (let i = 0; i < pedidos.length; i++) {
    const productoId = ids[i]!;
    const precioLista = catalogo.get(productoId);
    if (precioLista === undefined) return error('El producto ' + productoId + ' no existe o esta dado de baja', 400);

    const cantidad = Number(pedidos[i].cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return error('La cantidad de cada producto tiene que ser mayor a cero', 400);
    }

    // El precio se puede pisar (un vendedor negocia), pero si no viene se
    // copia el de lista. Nunca se lee del catalogo despues: queda congelado.
    let precio = precioLista;
    if (pedidos[i].precio_unitario !== undefined && pedidos[i].precio_unitario !== null) {
      precio = Number(pedidos[i].precio_unitario);
      if (!Number.isFinite(precio) || precio < 0) return error('El precio no puede ser negativo', 400);
    }

    renglones.push({ producto_id: productoId, cantidad, precio_unitario: precio });
  }

  // La venta se le acredita al vendedor del cliente, no a quien la teclea:
  // si el dueño carga un pedido, la venta sigue siendo del vendedor de esa
  // cuenta. `creado_por` guarda quien la registro.
  const alta = await ctx.env.DB.prepare(
    'INSERT INTO pedidos (cliente_id, vendedor_id, fecha, estado, notas, creado_por) ' +
      "VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?)",
  )
    .bind(cliente.id, cliente.vendedor_id, fecha, estado, textoOpcional(body.notas), sesion.id)
    .run();

  const pedidoId = alta.meta.last_row_id;

  try {
    await ctx.env.DB.batch(
      renglones.map((r) =>
        ctx.env.DB.prepare(
          'INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
        ).bind(pedidoId, r.producto_id, r.cantidad, r.precio_unitario),
      ),
    );
  } catch (e) {
    // D1 no da transacciones entre llamadas separadas. Se valida todo antes de
    // insertar la cabecera, asi que llegar aca es raro; si pasa, se borra el
    // pedido para no dejar una venta de total cero dando vueltas.
    await ctx.env.DB.prepare('DELETE FROM pedidos WHERE id = ?').bind(pedidoId).run();
    throw e;
  }

  return json({ id: pedidoId, renglones: renglones.length }, 201);
}

// ---------------------------------------------------------------------------
//  PATCH /api/pedidos/:id
// ---------------------------------------------------------------------------

/**
 * Solo cambia el estado. Editar los renglones de un pedido ya registrado
 * reescribiria el historial de ventas: si esta mal, se anula y se carga otro.
 */
export async function editarPedido(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de pedido invalido', 400);

  const body = await leerBody<{ estado?: unknown }>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);
  if (!esUnoDe(body.estado, ESTADOS_PEDIDO)) {
    return error("El estado tiene que ser 'pendiente', 'entregado' o 'anulado'", 400);
  }

  const pedido = await ctx.env.DB.prepare(
    'SELECT p.id, p.cliente_id, c.vendedor_id ' +
      '  FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ' +
      ' WHERE p.id = ? AND c.eliminado = 0',
  )
    .bind(id)
    .first<{ id: number; cliente_id: number; vendedor_id: number }>();

  if (!pedido) return error('Pedido no encontrado', 404);
  if (!esAdmin(sesion) && pedido.vendedor_id !== sesion.id) {
    return error('Ese pedido no es de tu cartera', 403);
  }

  await ctx.env.DB.prepare('UPDATE pedidos SET estado = ? WHERE id = ?').bind(body.estado, id).run();

  return json({ ok: true });
}
