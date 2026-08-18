/**
 * Semaforo de contacto (CLAUDE.md seccion 7):
 *   < 30 verde · 30-60 amarillo · > 60 rojo
 *
 * El umbral vive en un solo lugar del front, igual que en el servidor vive
 * en src/api/reglas.ts.
 */
export function colorContacto(dias: number | null): string {
  if (dias === null) return 'neutro';
  if (dias > 60) return 'rojo';
  if (dias >= 30) return 'amarillo';
  return 'verde';
}

/**
 * Dejar de comprar un mes es normal; medio año no. Por eso los cortes son
 * mas altos que los de contacto.
 */
export function colorCompra(dias: number | null): string {
  if (dias === null) return 'neutro';
  if (dias > 180) return 'rojo';
  if (dias > 90) return 'amarillo';
  return 'verde';
}

/** Texto sin tildes y en minusculas, para comparar en el buscador. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Arma el enlace de WhatsApp con el mensaje ya redactado.
 *
 * El envio automatico esta fuera de alcance: requiere la API de WhatsApp
 * Business de Meta, con verificacion de la empresa y plantillas aprobadas.
 * Esto abre la conversacion con el texto escrito, que cubre casi todo el
 * valor y no depende de ningun tramite.
 */
export function enlaceWhatsapp(telefono: string | null, mensaje: string): string | null {
  if (!telefono) return null;
  // 09X XXX XXX -> 598 9X XXX XXX (Uruguay, sin el cero inicial)
  const soloDigitos = telefono.replace(/\D/g, '');
  if (soloDigitos.length < 8) return null;
  const nacional = soloDigitos.startsWith('0') ? soloDigitos.slice(1) : soloDigitos;
  const internacional = nacional.startsWith('598') ? nacional : '598' + nacional;
  return `https://wa.me/${internacional}?text=${encodeURIComponent(mensaje)}`;
}

/** "2026-07-07 13:12:12" -> "7 jul 2026" */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [fecha] = iso.split(' ');
  const [a, m, d] = fecha.split('-').map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Pesos uruguayos, sin decimales: los montos de insumos son enteros. */
export function moneda(valor: number): string {
  return '$ ' + Math.round(valor).toLocaleString('es-UY');
}
