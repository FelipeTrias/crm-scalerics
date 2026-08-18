/**
 * Tipos compartidos de la API.
 */

export type Rol = 'admin' | 'vendedor';

/**
 * El Env que genera `wrangler types` sale de wrangler.jsonc, y los secretos no
 * se declaran ahi. JWT_SECRET se carga de .dev.vars en local y de
 * `wrangler secret put` en produccion, asi que hay que sumarlo a mano.
 */
export interface Entorno extends Env {
  JWT_SECRET: string;
}

/** Usuario tal como se lo devolvemos al front. Nunca incluye el hash. */
export interface UsuarioPublico {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
}

/** Lo que viaja dentro del token y define el alcance de cada consulta. */
export interface Sesion {
  id: number;
  nombre: string;
  rol: Rol;
}

/** Contexto que el router le arma a cada manejador. */
export interface Contexto {
  request: Request;
  env: Entorno;
  ctx: ExecutionContext;
  url: URL;
  params: Record<string, string>;
}
