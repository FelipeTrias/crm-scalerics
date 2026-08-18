/**
 * Helpers de request y response. Todo lo que sale de la API pasa por aca,
 * asi el formato de error es siempre el mismo: { "error": "mensaje" }.
 */

export function json(datos: unknown, status = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras },
  });
}

export function error(mensaje: string, status: number): Response {
  return json({ error: mensaje }, status);
}

/** Devuelve null si el body no es JSON valido, en vez de tirar una excepcion. */
export async function leerBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Validaciones de entrada.
//
//  Los CHECK de la base son la ultima linea de defensa, no la primera: si un
//  valor invalido llega a SQLite, el error que vuelve es incomprensible para
//  quien consume la API. Se valida antes y se responde 400 en castellano.
// ---------------------------------------------------------------------------

export function textoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

export function esUnoDe<T extends string>(valor: unknown, opciones: readonly T[]): valor is T {
  return typeof valor === 'string' && (opciones as readonly string[]).includes(valor);
}

export function enteroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Acepta unicamente AAAA-MM-DD, que es el formato que SQLite compara y ordena
 * bien. La vuelta por Date descarta fechas que pasan la expresion regular pero
 * no existen, como 2026-02-30.
 */
export function fechaIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(valor + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

/** Devuelve el texto recortado, o null si vino vacio o no es texto. */
export function textoOpcional(valor: unknown): string | null {
  return textoNoVacio(valor) ? valor.trim() : null;
}
