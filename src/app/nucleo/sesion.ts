import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import type { Usuario } from './modelos';

/**
 * Usuario de la sesion actual.
 *
 * Lo que el front sabe del rol sirve para mostrar u ocultar botones, nada mas.
 * Los permisos de verdad los aplica el servidor en cada consulta: si alguien
 * fuerza la ruta del panel del dueño siendo vendedor, la API responde 403 y la
 * pantalla queda vacia.
 */
@Injectable({ providedIn: 'root' })
export class Sesion {
  private readonly api = inject(Api);

  readonly usuario = signal<Usuario | null>(null);
  readonly esAdmin = computed(() => this.usuario()?.rol === 'admin');

  /** Evita que varias pantallas pidan /api/me a la vez al entrar. */
  private consulta: Promise<boolean> | null = null;

  async iniciar(email: string, password: string): Promise<void> {
    const r = await this.api.post<{ usuario: Usuario }>('/auth/login', { email, password });
    this.usuario.set(r.usuario);
    this.consulta = null;
  }

  async cerrar(): Promise<void> {
    try {
      await this.api.post('/auth/logout', {});
    } finally {
      this.usuario.set(null);
      this.consulta = null;
    }
  }

  /** true si hay sesion valida. Consulta al servidor una sola vez. */
  asegurar(): Promise<boolean> {
    if (this.usuario()) return Promise.resolve(true);
    this.consulta ??= this.api
      .get<{ usuario: Usuario }>('/me')
      .then((r) => {
        this.usuario.set(r.usuario);
        return true;
      })
      .catch(() => {
        this.usuario.set(null);
        return false;
      })
      .finally(() => {
        this.consulta = null;
      });
    return this.consulta;
  }
}
