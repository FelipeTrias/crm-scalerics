/**
 * Router de la API.
 *
 * A mano y sin dependencias: 18 endpoints no justifican una libreria, y "el
 * backend no tiene ninguna dependencia" es mas facil de defender que "usamos
 * este router porque si".
 *
 * Toda ruta pide sesion salvo que este marcada `publica`. El olvido tipico es
 * al reves — dejar todo abierto y acordarse despues — asi que el default es
 * el seguro.
 */
import { error } from './http';
import { login, logout, me, sesionDe } from './auth';
import {
  crearCliente,
  editarCliente,
  eliminarCliente,
  listarClientes,
  reasignarCartera,
  verCliente,
} from './rutas/clientes';
import { editarAlerta, listarAlertas } from './rutas/alertas';
import { editarUsuario, listarVendedores } from './rutas/usuarios';
import { crearInteraccion, listarInteracciones } from './rutas/interacciones';
import { crearOportunidad, editarOportunidad, listarOportunidades } from './rutas/oportunidades';
import type { Contexto, Entorno, Sesion } from './tipos';

type Manejador = (ctx: Contexto, sesion: Sesion) => Promise<Response> | Response;

interface Ruta {
  metodo: string;
  /** Segmentos del patron; los que empiezan con ':' son parametros. */
  segmentos: string[];
  publica: boolean;
  manejador: Manejador;
}

function ruta(metodo: string, patron: string, manejador: Manejador, publica = false): Ruta {
  return { metodo, segmentos: patron.split('/').filter(Boolean), publica, manejador };
}

const RUTAS: Ruta[] = [
  ruta('POST', '/api/auth/login', login, true),
  ruta('POST', '/api/auth/logout', logout, true),
  ruta('GET', '/api/me', me),

  ruta('GET', '/api/clientes', listarClientes),
  ruta('POST', '/api/clientes', crearCliente),
  // Va antes que /api/clientes/:id para que quede explicito que es una ruta
  // literal y no un id. El matcher igual la encuentra, pero se lee mejor asi.
  ruta('POST', '/api/clientes/reasignar', reasignarCartera),
  ruta('GET', '/api/clientes/:id', verCliente),
  ruta('PATCH', '/api/clientes/:id', editarCliente),
  ruta('DELETE', '/api/clientes/:id', eliminarCliente),

  ruta('GET', '/api/clientes/:id/interacciones', listarInteracciones),
  ruta('POST', '/api/clientes/:id/interacciones', crearInteraccion),

  ruta('GET', '/api/oportunidades', listarOportunidades),
  ruta('POST', '/api/oportunidades', crearOportunidad),
  ruta('PATCH', '/api/oportunidades/:id', editarOportunidad),

  ruta('GET', '/api/alertas', listarAlertas),
  ruta('PATCH', '/api/alertas/:id', editarAlerta),

  ruta('GET', '/api/vendedores', listarVendedores),
  ruta('PATCH', '/api/usuarios/:id', editarUsuario),
];

interface Coincidencia {
  ruta: Ruta;
  params: Record<string, string>;
}

function buscarRuta(metodo: string, pathname: string): Coincidencia | 'metodo-no-permitido' | null {
  const partes = pathname.split('/').filter(Boolean);
  let hayPathIgual = false;

  for (const r of RUTAS) {
    if (r.segmentos.length !== partes.length) continue;

    const params: Record<string, string> = {};
    let coincide = true;
    for (let i = 0; i < r.segmentos.length; i++) {
      const s = r.segmentos[i];
      if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(partes[i]);
      else if (s !== partes[i]) {
        coincide = false;
        break;
      }
    }
    if (!coincide) continue;

    hayPathIgual = true;
    if (r.metodo === metodo) return { ruta: r, params };
  }

  return hayPathIgual ? 'metodo-no-permitido' : null;
}

export async function manejarApi(request: Request, env: Entorno, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  const encontrada = buscarRuta(request.method, url.pathname);
  if (encontrada === null) return error('Recurso no encontrado', 404);
  if (encontrada === 'metodo-no-permitido') return error('Metodo no permitido', 405);

  const contexto: Contexto = { request, env, ctx, url, params: encontrada.params };

  let sesion: Sesion | null = null;
  if (!encontrada.ruta.publica) {
    sesion = await sesionDe(request, env);
    if (!sesion) return error('Sesion no valida o vencida', 401);
  }

  try {
    return await encontrada.ruta.manejador(contexto, sesion as Sesion);
  } catch (e) {
    // El detalle queda en el log del Worker (observability esta activada en
    // wrangler.jsonc, se ve con `wrangler tail`). Al cliente no le llega nada
    // del error de SQLite.
    console.error('Error no controlado en la API', url.pathname, e);
    return error('Error interno del servidor', 500);
  }
}
