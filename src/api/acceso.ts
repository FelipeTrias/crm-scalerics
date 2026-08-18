/**
 * Comprobaciones de acceso que necesitan ir a la base.
 *
 * permisos.ts arma fragmentos de SQL; esto resuelve el caso puntual de
 * "¿este usuario puede tocar este registro?", que aparece en varias rutas.
 */
import { error } from './http';
import { esAdmin } from './permisos';
import type { Entorno, Sesion } from './tipos';

export interface ClienteMinimo {
  id: number;
  vendedor_id: number;
}

export function esRespuesta<T>(x: T | Response): x is Response {
  return x instanceof Response;
}

/**
 * Devuelve el cliente si el usuario puede operarlo, o la Response con la que
 * hay que cortar.
 *
 * Se distingue lectura de escritura a proposito: al leer se responde 404 para
 * no confirmar que el cliente existe ni de quien es; al escribir 403, porque
 * ahi el mensaje le sirve al vendedor para entender que paso.
 */
export async function clienteAccesible(
  env: Entorno,
  id: number | null,
  sesion: Sesion,
  modo: 'lectura' | 'escritura',
): Promise<ClienteMinimo | Response> {
  if (!id) return error('Id de cliente invalido', 400);

  const cliente = await env.DB.prepare('SELECT id, vendedor_id FROM clientes WHERE id = ? AND eliminado = 0')
    .bind(id)
    .first<ClienteMinimo>();

  if (!cliente) return error('Cliente no encontrado', 404);

  if (!esAdmin(sesion) && cliente.vendedor_id !== sesion.id) {
    return modo === 'lectura' ? error('Cliente no encontrado', 404) : error('Ese cliente no es de tu cartera', 403);
  }

  return cliente;
}
