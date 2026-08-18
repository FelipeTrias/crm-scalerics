/**
 * Dashboard del dueño.
 *
 * Responde literalmente a "yo no tengo idea de que esta pasando" y a "cuantos
 * presupuestos mando cada uno". Todo se calcula en SQL, en una sola tanda.
 *
 * Es solo para el admin. Un vendedor no necesita ver la produccion de sus
 * compañeros, y mostrarsela cambiaria la herramienta de "mi cartera" a
 * "el ranking", que no es lo que se pidio.
 */
import { error, json } from '../http';
import { esAdmin } from '../permisos';
import { DIAS_SIN_COMPRA_RIESGO, DIAS_SIN_CONTACTO_RIESGO, SQL_DIAS_SIN_COMPRA, SQL_DIAS_SIN_CONTACTO } from '../reglas';
import type { Contexto, Sesion } from '../tipos';

/** Ventana de "esta semana": ultimos 7 dias corridos, no semana calendario. */
const DIAS_SEMANA = 7;

export async function verDashboard(ctx: Contexto, sesion: Sesion): Promise<Response> {
  if (!esAdmin(sesion)) return error('El panel de control es solo para el administrador', 403);

  const [porVendedor, porEtapa, riesgo, totales] = await ctx.env.DB.batch([
    // Una fila por vendedor con todo lo que el dueño pregunta en la reunion
    // de los lunes: cuantos clientes tiene, cuanto se movio esta semana,
    // cuantos presupuestos mando y cuanto lleva vendido.
    ctx.env.DB.prepare(
      'SELECT u.id, u.nombre, ' +
        '  (SELECT COUNT(*) FROM clientes c WHERE c.vendedor_id = u.id AND c.eliminado = 0) AS clientes, ' +
        '  (SELECT COUNT(*) FROM interacciones i WHERE i.usuario_id = u.id ' +
        "     AND i.fecha >= datetime('now','-" + DIAS_SEMANA + " days')) AS interacciones_semana, " +
        '  (SELECT COUNT(*) FROM pedidos pd WHERE pd.vendedor_id = u.id ' +
        "     AND pd.estado = 'presupuesto') AS presupuestos_en_curso, " +
        // Ahora es exacto: un presupuesto es una fila, no una etapa que hay que
        // adivinar. Antes se contaban las oportunidades que habian pasado de
        // 'contactado', que era una aproximacion.
        '  (SELECT COUNT(*) FROM pedidos pd WHERE pd.vendedor_id = u.id) AS presupuestos_enviados, ' +
        // Lo vendido sale de los pedidos reales, no del monto estimado de las
        // oportunidades: una cosa es lo que se esperaba cerrar y otra lo que
        // el cliente termino comprando.
        '  (SELECT COALESCE(SUM(i.cantidad * i.precio_unitario), 0) ' +
        '     FROM pedidos pd JOIN pedido_items i ON i.pedido_id = pd.id ' +
        "    WHERE pd.vendedor_id = u.id AND pd.estado IN ('confirmado','entregado')) AS monto_vendido " +
        "  FROM usuarios u WHERE u.rol = 'vendedor' AND u.activo = 1 " +
        ' ORDER BY u.nombre COLLATE NOCASE',
    ),

    // Reparto por estado, con el monto sumado de los renglones reales.
    ctx.env.DB.prepare(
      'SELECT p.estado, COUNT(*) AS cantidad, ' +
        '       COALESCE(SUM((SELECT SUM(i.cantidad * i.precio_unitario) ' +
        '                       FROM pedido_items i WHERE i.pedido_id = p.id)), 0) AS monto_total ' +
        '  FROM pedidos p JOIN clientes c ON c.id = p.cliente_id ' +
        ' WHERE c.eliminado = 0 GROUP BY p.estado',
    ),

    // Clientes en riesgo por cualquiera de las dos causas, abierto por vendedor
    // para que el dueño sepa a quien reclamarle.
    ctx.env.DB.prepare(
      'SELECT vendedor_id, nombre AS vendedor_nombre, COUNT(*) AS clientes_en_riesgo FROM (' +
        '  SELECT c.id, c.vendedor_id, u.nombre, ' +
        '         ' + SQL_DIAS_SIN_CONTACTO + ' AS dias_sin_contacto, ' +
        '         ' + SQL_DIAS_SIN_COMPRA + ' AS dias_sin_compra ' +
        '    FROM clientes c ' +
        '    JOIN usuarios u ON u.id = c.vendedor_id ' +
        '    LEFT JOIN interacciones i ON i.cliente_id = c.id ' +
        '   WHERE c.eliminado = 0 ' +
        '   GROUP BY c.id ' +
        '  HAVING dias_sin_contacto > ' + DIAS_SIN_CONTACTO_RIESGO +
        '      OR dias_sin_compra > ' + DIAS_SIN_COMPRA_RIESGO +
        ') GROUP BY vendedor_id, nombre ORDER BY clientes_en_riesgo DESC',
    ),

    ctx.env.DB.prepare(
      'SELECT ' +
        '  (SELECT COUNT(*) FROM clientes WHERE eliminado = 0) AS clientes_totales, ' +
        "  (SELECT COUNT(*) FROM clientes WHERE eliminado = 0 AND estado = 'activo') AS clientes_activos, " +
        "  (SELECT COUNT(*) FROM clientes WHERE eliminado = 0 AND estado = 'prospecto') AS prospectos, " +
        // Lo que esta en la calle esperando respuesta: presupuestos sin cerrar.
        '  (SELECT COALESCE(SUM(i.cantidad * i.precio_unitario), 0) ' +
        '     FROM pedidos p JOIN pedido_items i ON i.pedido_id = p.id ' +
        '     JOIN clientes c ON c.id = p.cliente_id ' +
        "    WHERE c.eliminado = 0 AND p.estado = 'presupuesto') AS monto_en_pipeline, " +
        '  (SELECT COUNT(*) FROM interacciones ' +
        "     WHERE fecha >= datetime('now','-" + DIAS_SEMANA + " days')) AS interacciones_semana, " +
        "  (SELECT COUNT(*) FROM alertas WHERE estado = 'pendiente') AS alertas_pendientes",
    ),
  ]);

  const enRiesgo = riesgo.results as Array<{ clientes_en_riesgo: number }>;
  const totalEnRiesgo = enRiesgo.reduce((suma, fila) => suma + fila.clientes_en_riesgo, 0);

  return json({
    resumen: { ...(totales.results[0] as object), clientes_en_riesgo: totalEnRiesgo },
    por_vendedor: porVendedor.results,
    por_estado: porEtapa.results,
    riesgo_por_vendedor: enRiesgo,
  });
}
