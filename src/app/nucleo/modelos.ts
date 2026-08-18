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
  /** 1 si alguien lo marco como atendido en la ultima semana. */
  atendido?: number;
  /** Avisos que dejo el cron y nadie miro todavia. */
  avisos_nuevos?: number;
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

/** Respuesta de GET /api/clientes/:id */
export interface FichaCliente {
  cliente: Cliente;
  contactos: Contacto[];
  interacciones: Interaccion[];
}

export interface Vendedor {
  id: number;
  nombre: string;
  email: string;
  activo: number;
  clientes: number;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  precio_lista: number;
  activo: number;
}

export interface PedidoItem {
  producto_id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  /** Precio al momento de la venta, no el actual del catalogo. */
  precio_unitario: number;
}

/**
 * Un presupuesto es un pedido que todavia no se confirmo.
 *
 *     presupuesto -> confirmado -> entregado
 *          |             |
 *       perdido       anulado
 */
export type EstadoPedido = 'presupuesto' | 'confirmado' | 'entregado' | 'perdido' | 'anulado';

export interface Pedido {
  id: number;
  fecha: string;
  estado: EstadoPedido;
  notas: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  /** Se calcula en el servidor sumando los renglones; no esta guardado. */
  total: number;
  items: PedidoItem[];
}
