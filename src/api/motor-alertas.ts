/**
 * Motor de alertas por inactividad.
 *
 * Corre todos los dias a las 8:00 de Montevideo desde el cron del Worker, y
 * tambien a pedido del dueño desde POST /api/alertas/generar.
 *
 * Es lo que responde a "tengo clientes que compraban todos los meses y hace
 * medio año no compran y nadie se dio cuenta". La pantalla de riesgo muestra
 * quien esta mal HOY; estas alertas son el registro de que al vendedor ya se
 * le aviso, y son las que alimentan la campanita.
 *
 * Nota sobre la columna `dias_sin_contacto`: para las alertas de tipo
 * 'sin_compra' guarda los dias sin comprar. El nombre quedo del schema
 * original; se mantiene para no arrastrar una migracion a mitad del proyecto.
 */
import {
  DIAS_SIN_COMPRA_RIESGO,
  DIAS_SIN_CONTACTO_RIESGO,
  SQL_DIAS_SIN_COMPRA,
  SQL_DIAS_SIN_CONTACTO,
} from './reglas';

export interface ResumenAlertas {
  sin_contacto: number;
  sin_compra: number;
}

interface Candidato {
  id: number;
  vendedor_id: number;
  nombre: string;
  dias: number;
}

/**
 * No se vuelve a avisar si ya hay una alerta pendiente para ese cliente y tipo,
 * ni si se genero una en los ultimos 7 dias.
 *
 * Sin la segunda condicion, apenas el vendedor marca una alerta como vista el
 * cron se la vuelve a crear al dia siguiente, y termina ignorandolas todas.
 * El indice unico parcial de la base es el respaldo de esto, no el mecanismo.
 */
const INSERTAR =
  'INSERT INTO alertas (cliente_id, vendedor_id, tipo, dias_sin_contacto, mensaje) ' +
  'SELECT ?1, ?2, ?3, ?4, ?5 ' +
  ' WHERE NOT EXISTS (' +
  '   SELECT 1 FROM alertas ' +
  '    WHERE cliente_id = ?1 AND tipo = ?3 ' +
  "      AND (estado = 'pendiente' OR generada_en > datetime('now','-7 days'))" +
  ' )';

export async function generarAlertas(db: D1Database): Promise<ResumenAlertas> {
  const sinContacto = await db
    .prepare(
      'SELECT c.id, c.vendedor_id, COALESCE(c.nombre_fantasia, c.razon_social) AS nombre, ' +
        '       ' + SQL_DIAS_SIN_CONTACTO + ' AS dias ' +
        '  FROM clientes c ' +
        '  LEFT JOIN interacciones i ON i.cliente_id = c.id ' +
        ' WHERE c.eliminado = 0 ' +
        ' GROUP BY c.id ' +
        'HAVING dias > ?',
    )
    .bind(DIAS_SIN_CONTACTO_RIESGO)
    .all<Candidato>();

  const sinCompra = await db
    .prepare(
      'SELECT c.id, c.vendedor_id, COALESCE(c.nombre_fantasia, c.razon_social) AS nombre, ' +
        '       ' + SQL_DIAS_SIN_COMPRA + ' AS dias ' +
        '  FROM clientes c ' +
        ' WHERE c.eliminado = 0 ' +
        '   AND dias > ?',
    )
    .bind(DIAS_SIN_COMPRA_RIESGO)
    .all<Candidato>();

  const sentencias = [
    ...sinContacto.results.map((c) =>
      db
        .prepare(INSERTAR)
        .bind(c.id, c.vendedor_id, 'sin_contacto', c.dias, `Hace ${c.dias} dias que no se contacta a ${c.nombre}.`),
    ),
    ...sinCompra.results.map((c) =>
      db
        .prepare(INSERTAR)
        .bind(c.id, c.vendedor_id, 'sin_compra', c.dias, `${c.nombre} no registra compras hace ${c.dias} dias.`),
    ),
  ];

  if (sentencias.length === 0) return { sin_contacto: 0, sin_compra: 0 };

  const resultados = await db.batch(sentencias);
  const creadas = resultados.map((r) => r.meta.changes);

  return {
    sin_contacto: creadas.slice(0, sinContacto.results.length).reduce((a, b) => a + b, 0),
    sin_compra: creadas.slice(sinContacto.results.length).reduce((a, b) => a + b, 0),
  };
}
