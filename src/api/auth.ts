/**
 * Autenticacion: JWT firmado con HMAC-SHA256 via crypto.subtle, guardado en
 * una cookie httpOnly.
 *
 * Sin librerias: firmar y verificar un HS256 son veinte lineas con la Web
 * Crypto API, que es nativa en Workers. Una dependencia de auth aca seria
 * superficie de ataque y peso extra sin ninguna ventaja.
 */
import { verifyPassword } from './password';
import { error, json, leerBody, textoNoVacio } from './http';
import type { Contexto, Entorno, Rol, Sesion, UsuarioPublico } from './tipos';

const NOMBRE_COOKIE = 'sesion';
const DIAS_SESION = 7;

// ---------------------------------------------------------------------------
//  base64url
// ---------------------------------------------------------------------------

function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function desdeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = base + '='.repeat((4 - (base.length % 4)) % 4);
  const binario = atob(relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
//  JWT
// ---------------------------------------------------------------------------

interface Payload {
  sub: number;
  nombre: string;
  rol: Rol;
  exp: number;
}

async function claveHmac(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function firmarJwt(payload: Payload, secreto: string): Promise<string> {
  const cabecera = aBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const cuerpo = aBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const datos = cabecera + '.' + cuerpo;
  const firma = await crypto.subtle.sign('HMAC', await claveHmac(secreto), new TextEncoder().encode(datos));
  return datos + '.' + aBase64Url(new Uint8Array(firma));
}

async function verificarJwt(token: string, secreto: string): Promise<Payload | null> {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const datos = new TextEncoder().encode(partes[0] + '.' + partes[1]);
  let valido = false;
  try {
    // crypto.subtle.verify compara en tiempo constante.
    valido = await crypto.subtle.verify('HMAC', await claveHmac(secreto), desdeBase64Url(partes[2]), datos);
  } catch {
    return null;
  }
  if (!valido) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(desdeBase64Url(partes[1])));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// ---------------------------------------------------------------------------
//  Cookie
// ---------------------------------------------------------------------------

/**
 * El flag Secure hace que el navegador no mande la cookie por http, asi que en
 * localhost romperia el login. Se agrega solo cuando la conexion ya es https,
 * que es siempre el caso en produccion.
 */
function cookieDeSesion(token: string, url: URL): string {
  const partes = [
    NOMBRE_COOKIE + '=' + token,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=' + DIAS_SESION * 24 * 60 * 60,
  ];
  if (url.protocol === 'https:') partes.push('Secure');
  return partes.join('; ');
}

function cookieBorrada(url: URL): string {
  const partes = [NOMBRE_COOKIE + '=', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (url.protocol === 'https:') partes.push('Secure');
  return partes.join('; ');
}

function leerCookie(request: Request, nombre: string): string | null {
  const cabecera = request.headers.get('Cookie');
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const igual = parte.indexOf('=');
    if (igual === -1) continue;
    if (parte.slice(0, igual).trim() === nombre) return parte.slice(igual + 1).trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Sesion
// ---------------------------------------------------------------------------

/** Devuelve la sesion del token, o null si no hay cookie, no valida o vencio. */
export async function sesionDe(request: Request, env: Entorno): Promise<Sesion | null> {
  const token = leerCookie(request, NOMBRE_COOKIE);
  if (!token) return null;

  const payload = await verificarJwt(token, env.JWT_SECRET);
  if (!payload) return null;

  return { id: payload.sub, nombre: payload.nombre, rol: payload.rol };
}

// ---------------------------------------------------------------------------
//  Endpoints
// ---------------------------------------------------------------------------

interface FilaUsuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  password_hash: string;
  activo: number;
}

export async function login(ctx: Contexto): Promise<Response> {
  const body = await leerBody<{ email?: unknown; password?: unknown }>(ctx.request);
  if (!body || !textoNoVacio(body.email) || !textoNoVacio(body.password)) {
    return error('Falta el email o la contrasenia', 400);
  }

  const fila = await ctx.env.DB.prepare(
    'SELECT id, nombre, email, rol, password_hash, activo FROM usuarios WHERE email = ?',
  )
    .bind(body.email.trim().toLowerCase())
    .first<FilaUsuario>();

  // Mismo mensaje para usuario inexistente, dado de baja o contrasenia mala:
  // si se distinguen, el login sirve para averiguar que emails existen.
  const generico = 'Email o contrasenia incorrectos';
  if (!fila || fila.activo !== 1) return error(generico, 401);
  if (!(await verifyPassword(body.password, fila.password_hash))) return error(generico, 401);

  const exp = Math.floor(Date.now() / 1000) + DIAS_SESION * 24 * 60 * 60;
  const token = await firmarJwt({ sub: fila.id, nombre: fila.nombre, rol: fila.rol, exp }, ctx.env.JWT_SECRET);

  const usuario: UsuarioPublico = { id: fila.id, nombre: fila.nombre, email: fila.email, rol: fila.rol };
  return json({ usuario }, 200, { 'Set-Cookie': cookieDeSesion(token, ctx.url) });
}

export function logout(ctx: Contexto): Response {
  return json({ ok: true }, 200, { 'Set-Cookie': cookieBorrada(ctx.url) });
}

export function me(_ctx: Contexto, sesion: Sesion): Response {
  return json({ usuario: sesion });
}
