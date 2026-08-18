import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import type { EstadoCliente, FichaCliente, Vendedor } from '../../nucleo/modelos';
import { Sesion } from '../../nucleo/sesion';

/** Alta y edicion de clientes. La misma pantalla para los dos casos. */
@Component({
  selector: 'app-formulario-cliente',
  imports: [FormsModule, RouterLink],
  template: `
    <h2>{{ esEdicion() ? 'Editar cliente' : 'Nuevo cliente' }}</h2>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando...</p>
    } @else {
      <form class="caja formulario" (ngSubmit)="guardar()">
        <div class="campo ancho">
          <label class="etiqueta" for="razon">Raz&oacute;n social *</label>
          <input id="razon" name="razon" type="text" required [(ngModel)]="datos.razon_social" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="fantasia">Nombre de fantas&iacute;a</label>
          <input id="fantasia" name="fantasia" type="text" [(ngModel)]="datos.nombre_fantasia" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="rut">RUT</label>
          <input id="rut" name="rut" type="text" inputmode="numeric" [(ngModel)]="datos.rut" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="direccion">Direcci&oacute;n</label>
          <input id="direccion" name="direccion" type="text" [(ngModel)]="datos.direccion" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="ciudad">Ciudad</label>
          <input id="ciudad" name="ciudad" type="text" [(ngModel)]="datos.ciudad" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="rubro">Rubro</label>
          <input id="rubro" name="rubro" type="text" [(ngModel)]="datos.rubro" />
        </div>

        <div class="campo">
          <label class="etiqueta" for="estado">Estado</label>
          <select id="estado" name="estado" [(ngModel)]="datos.estado">
            <option value="prospecto">Prospecto</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>

        <!-- Solo el dueño asigna cartera. Un vendedor da de alta para si mismo
             y el servidor lo impone: el vendedor_id que mande se ignora. -->
        @if (sesion.esAdmin()) {
          <div class="campo">
            <label class="etiqueta" for="vendedor">Vendedor asignado *</label>
            <select id="vendedor" name="vendedor" [(ngModel)]="datos.vendedor_id">
              <option [ngValue]="null">Elegir vendedor</option>
              @for (v of vendedores(); track v.id) {
                <option [ngValue]="v.id">{{ v.nombre }} ({{ v.clientes }})</option>
              }
            </select>
          </div>
        }

        <div class="campo ancho">
          <label class="etiqueta" for="notas">Notas</label>
          <textarea id="notas" name="notas" rows="3" [(ngModel)]="datos.notas"></textarea>
        </div>

        <div class="acciones">
          <a class="boton secundario" [routerLink]="volverA()">Cancelar</a>
          <button type="submit" class="boton" [disabled]="guardando()">
            {{ guardando() ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    h2 {
      margin-bottom: 12px;
    }

    .formulario {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 16px;
    }

    .campo.ancho {
      grid-column: 1 / -1;
    }

    .acciones {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .error {
      margin-bottom: 12px;
    }

    @media (max-width: 760px) {
      .formulario {
        grid-template-columns: 1fr;
      }

      .acciones .boton {
        flex: 1;
      }
    }
  `,
})
export class FormularioCliente {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly sesion = inject(Sesion);

  /** Viene de la ruta; ausente cuando es un alta. */
  readonly id = input<string | undefined>(undefined);

  protected readonly esEdicion = computed(() => !!this.id());
  protected readonly volverA = computed(() => (this.id() ? ['/clientes', this.id()!] : ['/clientes']));

  protected readonly vendedores = signal<Vendedor[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected datos: {
    razon_social: string;
    nombre_fantasia: string;
    rut: string;
    direccion: string;
    ciudad: string;
    rubro: string;
    estado: EstadoCliente;
    notas: string;
    vendedor_id: number | null;
  } = {
    razon_social: '',
    nombre_fantasia: '',
    rut: '',
    direccion: '',
    ciudad: '',
    rubro: '',
    estado: 'activo',
    notas: '',
    vendedor_id: null,
  };

  constructor() {
    // Igual que en nuevo-pedido: el input de la ruta no existe todavia en el
    // constructor. Sin esto, editar un cliente cargaba el formulario vacio.
    effect(() => {
      const id = this.id();
      if (typeof window !== 'undefined') void this.iniciar(id);
    });
  }

  private async iniciar(id: string | undefined): Promise<void> {
    this.cargando.set(true);
    try {
      if (this.sesion.esAdmin()) {
        const r = await this.api.get<{ vendedores: Vendedor[] }>('/vendedores');
        this.vendedores.set(r.vendedores.filter((v) => v.activo === 1));
      }
      if (id) {
        const f = await this.api.get<FichaCliente>(`/clientes/${id}`);
        this.datos = {
          razon_social: f.cliente.razon_social,
          nombre_fantasia: f.cliente.nombre_fantasia ?? '',
          rut: f.cliente.rut ?? '',
          direccion: f.cliente.direccion ?? '',
          ciudad: f.cliente.ciudad ?? '',
          rubro: f.cliente.rubro ?? '',
          estado: f.cliente.estado,
          notas: f.cliente.notas ?? '',
          vendedor_id: f.cliente.vendedor_id,
        };
      }
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el cliente'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (!this.datos.razon_social.trim()) {
      this.error.set('La razon social es obligatoria');
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    try {
      const cuerpo = { ...this.datos };
      if (!this.sesion.esAdmin()) delete (cuerpo as Partial<typeof cuerpo>).vendedor_id;

      const id = this.id();
      if (id) {
        await this.api.patch(`/clientes/${id}`, cuerpo);
        await this.router.navigate(['/clientes', id]);
      } else {
        const r = await this.api.post<{ id: number }>('/clientes', cuerpo);
        await this.router.navigate(['/clientes', r.id]);
      }
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar el cliente'));
    } finally {
      this.guardando.set(false);
    }
  }
}
