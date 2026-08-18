/**
 * Pipeline de oportunidades.
 *
 * Responde a "nunca se bien en que esta cada cosa, siempre esta todo en
 * proceso": las etapas son cerradas y el cambio queda registrado con fecha.
 *
 * Ademas de la lista, el GET devuelve el resumen por etapa (cantidad y monto).
 * Se calcula en SQL y no en el front para que el total de cada columna sea el
 * de la cartera completa, y no el de lo que el front tenga cargado.
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
import { esAdmin, filtroPorVendedor } from '../permisos';
import { ETAPAS_OPORTUNIDAD, MONEDAS } from '../reglas';
import type { Contexto, Sesion } from '../tipos';

/** Etapas en las que la oportunidad ya esta cerrada. */
const ETAPAS_CERRADAS = ['ganado', 'perdido'] as const;

function estaCerrada(etapa: string): boolean {
  return (ETAPAS_CERRADAS as readonly string[]).includes(etapa);
}

// ---------------------------------------------------------------------------
//  GET /api/oportunidades
// ---------------------------------------------------------------------------

export async function listarOportunidades(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const condiciones: string[] = ['c.eliminado = 0'];
  const params: unknown[] = [];

  const alcance = filtroPorVendedor(sesion, ctx.url, 'o.vendedor_id');
  if (alcance.sql) {
    condiciones.push(alcance.sql);
    params.push(...alcance.params);
  }

  const etapa = ctx.url.searchParams.get('etapa');
  if (etapa) {
    if (!esUnoDe(etapa, ETAPAS_OPORTUNIDAD)) return error('Etapa invalida', 400);
    condiciones.push('o.etapa = ?');
    params.push(etapa);
  }

  const where = ' WHERE ' + condiciones.join(' AND ');

  const [lista, resumen] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'SELECT o.id, o.cliente_id, c.razon_social, c.nombre_fantasia, o.vendedor_id, u.nombre AS vendedor_nombre, ' +
        '       o.titulo, o.monto_estimado, o.moneda, o.etapa, o.fecha_cierre_estimada, o.fecha_cierre_real, ' +
        '       o.motivo_perdida, o.actualizado_en ' +
        '  FROM oportunidades o ' +
        '  JOIN clientes c ON c.id = o.cliente_id ' +
        '  JOIN usuarios u ON u.id = o.vendedor_id ' +
        where +
        ' ORDER BY o.actualizado_en DESC',
    ).bind(...params),
    ctx.env.DB.prepare(
      'SELECT o.etapa, COUNT(*) AS cantidad, COALESCE(SUM(o.monto_estimado), 0) AS monto_total ' +
        '  FROM oportunidades o ' +
        '  JOIN clientes c ON c.id = o.cliente_id ' +
        where +
        ' GROUP BY o.etapa',
    ).bind(...params),
  ]);

  return json({ oportunidades: lista.results, resumen: resumen.results });
}

// ---------------------------------------------------------------------------
//  POST /api/oportunidades
// ---------------------------------------------------------------------------

interface CuerpoOportunidad {
  cliente_id?: unknown;
  titulo?: unknown;
  monto_estimado?: unknown;
  moneda?: unknown;
  etapa?: unknown;
  fecha_cierre_estimada?: unknown;
  motivo_perdida?: unknown;
}

/** null si no vino; false si vino pero no sirve. */
function montoValido(valor: unknown): number | null | false {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : false;
}

export async function crearOportunidad(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const body = await leerBody<CuerpoOportunidad>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  const cliente = await clienteAccesible(ctx.env, enteroPositivo(body.cliente_id), sesion, 'escritura');
  if (esRespuesta(cliente)) return cliente;

  if (!textoNoVacio(body.titulo)) return error('El titulo es obligatorio', 400);

  const etapa = body.etapa === undefined || body.etapa === null ? 'nuevo' : body.etapa;
  if (!esUnoDe(etapa, ETAPAS_OPORTUNIDAD)) return error('Etapa invalida', 400);

  const moneda = body.moneda === undefined || body.moneda === null ? 'UYU' : body.moneda;
  if (!esUnoDe(moneda, MONEDAS)) return error('La moneda tiene que ser UYU o USD', 400);

  const monto = montoValido(body.monto_estimado);
  if (monto === false) return error('El monto estimado tiene que ser un numero mayor o igual a cero', 400);

  let cierreEstimado: string | null = null;
  if (textoNoVacio(body.fecha_cierre_estimada)) {
    const valor = body.fecha_cierre_estimada.trim();
    if (!fechaIsoValida(valor)) return error('La fecha de cierre estimada tiene que ser AAAA-MM-DD', 400);
    cierreEstimado = valor;
  }

  // La oportunidad sigue al vendedor del cliente, no a quien la carga. Si el
  // dueño registra una oportunidad, es del vendedor que atiende esa cuenta.
  const resultado = await ctx.env.DB.prepare(
    'INSERT INTO oportunidades (cliente_id, vendedor_id, titulo, monto_estimado, moneda, etapa, ' +
      '                           fecha_cierre_estimada, fecha_cierre_real) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IN ('ganado','perdido') THEN date('now') ELSE NULL END)",
  )
    .bind(cliente.id, cliente.vendedor_id, body.titulo.trim(), monto, moneda, etapa, cierreEstimado, etapa)
    .run();

  return json({ id: resultado.meta.last_row_id }, 201);
}

// ---------------------------------------------------------------------------
//  PATCH /api/oportunidades/:id
// ---------------------------------------------------------------------------

interface FilaOportunidad {
  id: number;
  vendedor_id: number;
  etapa: string;
  fecha_cierre_real: string | null;
}

export async function editarOportunidad(ctx: Contexto, sesion: Sesion): Promise<Response> {
  const id = enteroPositivo(ctx.params['id']);
  if (!id) return error('Id de oportunidad invalido', 400);

  const body = await leerBody<CuerpoOportunidad>(ctx.request);
  if (!body) return error('El cuerpo del pedido no es JSON valido', 400);

  const actual = await ctx.env.DB.prepare(
    'SELECT o.id, o.vendedor_id, o.etapa, o.fecha_cierre_real ' +
      '  FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id ' +
      ' WHERE o.id = ? AND c.eliminado = 0',
  )
    .bind(id)
    .first<FilaOportunidad>();

  if (!actual) return error('Oportunidad no encontrada', 404);
  if (!esAdmin(sesion) && actual.vendedor_id !== sesion.id) {
    return error('Esa oportunidad no es de tu cartera', 403);
  }

  const asignaciones: string[] = [];
  const params: unknown[] = [];

  if (body.titulo !== undefined) {
    if (!textoNoVacio(body.titulo)) return error('El titulo no puede quedar vacio', 400);
    asignaciones.push('titulo = ?');
    params.push(body.titulo.trim());
  }

  if (body.monto_estimado !== undefined) {
    const monto = montoValido(body.monto_estimado);
    if (monto === false) return error('El monto estimado tiene que ser un numero mayor o igual a cero', 400);
    asignaciones.push('monto_estimado = ?');
    params.push(monto);
  }

  if (body.moneda !== undefined) {
    if (!esUnoDe(body.moneda, MONEDAS)) return error('La moneda tiene que ser UYU o USD', 400);
    asignaciones.push('moneda = ?');
    params.push(body.moneda);
  }

  if (body.fecha_cierre_estimada !== undefined) {
    let valor: string | null = null;
    if (textoNoVacio(body.fecha_cierre_estimada)) {
      valor = body.fecha_cierre_estimada.trim();
      if (!fechaIsoValida(valor)) return error('La fecha de cierre estimada tiene que ser AAAA-MM-DD', 400);
    }
    asignaciones.push('fecha_cierre_estimada = ?');
    params.push(valor);
  }

  if (body.motivo_perdida !== undefined) {
    asignaciones.push('motivo_perdida = ?');
    params.push(textoOpcional(body.motivo_perdida));
  }

  // Cambio de etapa. fecha_cierre_real se maneja sola porque de ella depende
  // toda la metrica de dias sin compra: si dependiera de que alguien se acuerde
  // de completarla, la mitad de las ventas no tendria fecha y la pantalla de
  // clientes en riesgo mostraria cualquier cosa.
  if (body.etapa !== undefined) {
    if (!esUnoDe(body.etapa, ETAPAS_OPORTUNIDAD)) return error('Etapa invalida', 400);
    asignaciones.push('etapa = ?');
    params.push(body.etapa);

    if (estaCerrada(body.etapa)) {
      // Solo se sella la primera vez: reabrir y volver a cerrar no deberia
      // mover la fecha de la venta original.
      if (!estaCerrada(actual.etapa) || actual.fecha_cierre_real === null) {
        asignaciones.push("fecha_cierre_real = date('now')");
      }
      if (body.etapa === 'ganado' && body.motivo_perdida === undefined) {
        asignaciones.push('motivo_perdida = NULL');
      }
    } else if (estaCerrada(actual.etapa)) {
      // Se reabrio: deja de contar como compra.
      asignaciones.push('fecha_cierre_real = NULL');
      asignaciones.push('motivo_perdida = NULL');
    }
  }

  if (asignaciones.length === 0) return error('No hay nada para modificar', 400);

  asignaciones.push("actualizado_en = datetime('now')");
  params.push(id);

  await ctx.env.DB.prepare('UPDATE oportunidades SET ' + asignaciones.join(', ') + ' WHERE id = ?')
    .bind(...params)
    .run();

  return json({ ok: true });
}
