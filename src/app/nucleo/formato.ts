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
