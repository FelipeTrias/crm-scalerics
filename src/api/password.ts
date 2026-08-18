/**
 * Hash y verificacion de contraseñas.
 *
 * PBKDF2 via crypto.subtle, que es nativo tanto en Cloudflare Workers como en
 * Node 22+. Ese es el motivo de que este archivo lo use el login del Worker Y
 * el generador del seed: un solo lugar define el formato, asi no puede pasar
 * que el seed genere hashes que el login despues no sepa validar.
 *
 * Formato almacenado:
 *   pbkdf2$<iteraciones>$<salt-base64>$<hash-base64>
 */

const ITERACIONES = 100_000;
const BYTES_SALT = 16;
const BYTES_HASH = 32; // SHA-256

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

function desdeBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function derivar(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iteraciones: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    clave,
    BYTES_HASH * 8,
  );
  return new Uint8Array(bits);
}

/** Compara en tiempo constante: no corta al primer byte distinto. */
function sonIguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(BYTES_SALT));
  const hash = await derivar(password, salt, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${aBase64(salt)}$${aBase64(hash)}`;
}

export async function verifyPassword(password: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;

  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1) return false;

  const salt = desdeBase64(partes[2]);
  const esperado = desdeBase64(partes[3]);
  const calculado = await derivar(password, salt, iteraciones);

  return sonIguales(calculado, esperado);
}
