/** Formas que devuelve la API. Espejo de src/api/tipos.ts y las rutas. */

export type Rol = 'admin' | 'vendedor';
export type EstadoCliente = 'prospecto' | 'activo' | 'inactivo';

export interface Usuario {
  id: number;
  nombre: string;
  email?: string;
  rol: Rol;
}

export interface Cliente {
  id: number;
  razon_social: string;
  nombre_fantasia: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  rubro: string | null;
  estado: EstadoCliente;
  notas: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  ultima_interaccion: string | null;
  dias_sin_contacto: number;
  dias_sin_compra: number | null;
  /** Solo viene en el listado, para el boton de WhatsApp. */
  contacto_principal?: string | null;
  whatsapp?: string | null;
}

export interface Contacto {
  id: number;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  es_principal: number;
}

export interface Interaccion {
  id: number;
  tipo: 'llamada' | 'visita' | 'whatsapp' | 'email';
  fecha: string;
  resultado: string | null;
  notas: string | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  usuario_id: number;
  usuario_nombre: string;
}

export interface Oportunidad {
  id: number;
  titulo: string;
  monto_estimado: number | null;
  moneda: 'UYU' | 'USD';
  etapa: 'nuevo' | 'contactado' | 'presupuesto_enviado' | 'negociacion' | 'ganado' | 'perdido';
  fecha_cierre_estimada: string | null;
  fecha_cierre_real: string | null;
  motivo_perdida: string | null;
}

/** Respuesta de GET /api/clientes/:id */
export interface FichaCliente {
  cliente: Cliente;
  contactos: Contacto[];
  interacciones: Interaccion[];
  oportunidades: Oportunidad[];
}

export interface Vendedor {
  id: number;
  nombre: string;
  email: string;
  activo: number;
  clientes: number;
}
