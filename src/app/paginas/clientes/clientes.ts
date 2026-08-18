import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { colorCompra, colorContacto, normalizar } from '../../nucleo/formato';
import type { Cliente } from '../../nucleo/modelos';
import { Sesion } from '../../nucleo/sesion';

@Component({
  selector: 'app-clientes',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="titulo">
      <h2>{{ sesion.esAdmin() ? 'Todos los clientes' : 'Mi cartera' }}</h2>
      <span class="apagado num">{{ leyenda() }}</span>
      <a class="boton nuevo" routerLink="/clientes/nuevo">Nuevo cliente</a>
    </div>

    <input
      type="search"
      class="buscador"
      placeholder="Buscar por nombre, fantas&iacute;a o RUT..."
      aria-label="Buscar clientes"
      [ngModel]="busqueda()"
      (ngModelChange)="busqueda.set($event)"
    />

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando clientes...</p>
    } @else if (visibles().length === 0) {
      <p class="vacio">
        @if (busqueda()) {
          No hay clientes que coincidan con "{{ busqueda() }}".
        } @else {
          Todav&iacute;a no hay clientes cargados.
        }
      </p>
    } @else {
      <!-- Escritorio: tabla densa -->
      <div class="caja solo-escritorio">
        <div class="desplazable">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Ciudad</th>
                @if (sesion.esAdmin()) {
                  <th>Vendedor</th>
                }
                <th>Estado</th>
                <th>Sin contacto</th>
                <th>Sin compra</th>
              </tr>
            </thead>
            <tbody>
              @for (c of visibles(); track c.id) {
                <tr>
                  <td>
                    <a class="enlace" [routerLink]="['/clientes', c.id]">
                      <span class="principal">{{ c.nombre_fantasia || c.razon_social }}</span>
                    </a>
                    <div class="secundario">{{ c.razon_social }}</div>
                  </td>
                  <td>{{ c.ciudad || '—' }}</td>
                  @if (sesion.esAdmin()) {
                    <td>{{ c.vendedor_nombre }}</td>
                  }
                  <td><span class="estado" [class]="c.estado">{{ c.estado }}</span></td>
                  <td>
                    <span class="chip" [class]="colorContacto(c.dias_sin_contacto)">
                      {{ c.dias_sin_contacto }}<span class="u">d</span>
                    </span>
                  </td>
                  <td>
                    @if (c.dias_sin_compra === null) {
                      <span class="chip neutro">nunca compr&oacute;</span>
                    } @else {
                      <span class="chip" [class]="colorCompra(c.dias_sin_compra)">
                        {{ c.dias_sin_compra }}<span class="u">d</span>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Celular: tarjetas apiladas -->
      <div class="tarjetas solo-celular">
        @for (c of visibles(); track c.id) {
          <a class="tarjeta" [routerLink]="['/clientes', c.id]">
            <div class="arriba">
              <div>
                <div class="principal">{{ c.nombre_fantasia || c.razon_social }}</div>
                <div class="secundario">
                  {{ c.ciudad || 'Sin ciudad' }}@if (sesion.esAdmin()) { · {{ c.vendedor_nombre }} }
                </div>
              </div>
              <span class="chip" [class]="colorContacto(c.dias_sin_contacto)">
                {{ c.dias_sin_contacto }}<span class="u">d</span>
              </span>
            </div>
            <div class="abajo">
              <span class="estado" [class]="c.estado">{{ c.estado }}</span>
              <span class="secundario">Sin comprar</span>
              @if (c.dias_sin_compra === null) {
                <span class="chip neutro">nunca</span>
              } @else {
                <span class="chip" [class]="colorCompra(c.dias_sin_compra)">
                  {{ c.dias_sin_compra }}<span class="u">d</span>
                </span>
              }
            </div>
          </a>
        }
      </div>
    }
  `,
  styles: `
    .titulo {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }

    .buscador {
      margin-bottom: 12px;
    }

    .error {
      margin-bottom: 12px;
    }

    .nuevo {
      margin-left: auto;
    }

    .enlace {
      color: inherit;
      text-decoration: none;
    }

    .enlace:hover .principal {
      color: var(--azul-700);
      text-decoration: underline;
    }

    /* En el celular la tarjeta entera es el area tactil */
    a.tarjeta {
      color: inherit;
      text-decoration: none;
    }

    .solo-celular {
      display: none;
    }

    @media (max-width: 760px) {
      .solo-escritorio {
        display: none;
      }

      .solo-celular {
        display: flex;
      }
    }
  `,
})
export class Clientes {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);

  protected readonly colorContacto = colorContacto;
  protected readonly colorCompra = colorCompra;

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly busqueda = signal('');
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  /**
   * El filtro de texto se resuelve en el navegador a proposito: la lista que
   * llego ya viene acotada por el servidor a lo que este usuario puede ver, y
   * filtrar sobre lo que ya esta en memoria responde al instante mientras se
   * tipea. Lo que NUNCA se hace de este lado es el filtro por vendedor.
   */
  protected readonly visibles = computed(() => {
    const q = normalizar(this.busqueda().trim());
    if (!q) return this.clientes();
    return this.clientes().filter((c) =>
      normalizar([c.nombre_fantasia, c.razon_social, c.rut].filter(Boolean).join(' ')).includes(q),
    );
  });

  protected readonly leyenda = computed(() => {
    const total = this.clientes().length;
    const n = this.visibles().length;
    return n === total ? `${total} clientes` : `${n} de ${total} clientes`;
  });

  constructor() {
    // Solo en el navegador: durante el SSR no existe la cookie de sesion.
    afterNextRender(() => void this.cargar());
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.api.get<{ clientes: Cliente[] }>('/clientes');
      this.clientes.set(r.clientes);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar los clientes'));
    } finally {
      this.cargando.set(false);
    }
  }
}
