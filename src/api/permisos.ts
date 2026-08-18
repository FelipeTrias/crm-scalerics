/**
 * Alcance de datos por rol.
 *
 * ESTA ES LA REGLA CENTRAL DEL SISTEMA. El problema que el cliente quiere
 * resolver es que hoy la cartera es propiedad del vendedor. Si el filtro por
 * vendedor viviera en Angular, cualquiera abre las herramientas de desarrollo
 * y se lleva la cartera completa: el problema quedaria igual, pero disimulado.
 *
 * Por eso el filtro se arma aca y se pega a la consulta SQL. Ningun endpoint
 * devuelve una fila que el usuario no tenga derecho a ver.
 */
import type { Sesion } from './tipos';

export interface Filtro {
  /** Fragmento a concatenar al WHERE, o cadena vacia si no aplica. */
  sql: string;
  params: unknown[];
}

export function esAdmin(sesion: Sesion): boolean {
  return sesion.rol === 'admin';
}

/**
 * Filtro de cartera.
 *
 * - vendedor: siempre limitado a lo suyo, sin importar lo que pida por query
 * - admin: ve todo, y opcionalmente filtra con ?vendedor=N
 *
 * `columna` se recibe por parametro porque segun la consulta el alias cambia
 * (c.vendedor_id en clientes, p.vendedor_id en pedidos). Nunca viene del
 * request: la elige el codigo que arma la consulta.
 */
export function filtroPorVendedor(sesion: Sesion, url: URL, columna: string): Filtro {
  if (!esAdmin(sesion)) {
    return { sql: columna + ' = ?', params: [sesion.id] };
  }

  const pedido = url.searchParams.get('vendedor');
  if (pedido) {
    const id = Number(pedido);
    if (Number.isInteger(id) && id > 0) {
      return { sql: columna + ' = ?', params: [id] };
    }
  }

  return { sql: '', params: [] };
}

/**
 * Escapa los comodines de LIKE para que un buscador con "%" no devuelva todo.
 * Se usa junto con ESCAPE '\' en la consulta.
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => '\\' + c);
}
