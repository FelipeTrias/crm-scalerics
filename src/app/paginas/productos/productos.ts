import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeDeError } from '../../nucleo/api';
import { moneda, normalizar } from '../../nucleo/formato';
import type { Producto } from '../../nucleo/modelos';

/**
 * Catalogo de productos.
 *
 * Solo lectura: los precios se mantienen desde la base. Sirve para consultar
 * un precio en la calle sin tener que empezar a cargar un pedido.
 */
@Component({
  selector: 'app-productos',
  imports: [FormsModule],
  template: `
    <div class="titulo">
      <h2>Cat&aacute;logo</h2>
      <span class="apagado num">{{ leyenda() }}</span>
    </div>

    <input
      type="search"
      class="buscador"
      placeholder="Buscar por nombre, c&oacute;digo o categor&iacute;a..."
      aria-label="Buscar productos"
      [ngModel]="busqueda()"
      (ngModelChange)="busqueda.set($event)"
    />

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando cat&aacute;logo...</p>
    } @else if (visibles().length === 0) {
      <p class="vacio">No hay productos que coincidan.</p>
    } @else {
      @for (grupo of agrupados(); track grupo.categoria) {
        <section class="caja grupo">
          <h3>{{ grupo.categoria }}</h3>
          <div class="desplazable">
            <table>
              <thead>
                <tr>
                  <th>C&oacute;digo</th>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                @for (p of grupo.productos; track p.id) {
                  <tr>
                    <td class="num apagado">{{ p.codigo }}</td>
                    <td class="principal">{{ p.nombre }}</td>
                    <td>{{ p.unidad }}</td>
                    <td class="num precio">{{ moneda(p.precio_lista) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .titulo {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 12px;
    }

    .buscador,
    .error {
      margin-bottom: 12px;
    }

    .grupo {
      margin-bottom: 10px;
    }

    .grupo h3 {
      padding: 10px 12px 8px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gris-700);
    }

    .precio {
      font-weight: 650;
    }
  `,
})
export class Productos {
  private readonly api = inject(Api);
  protected readonly moneda = moneda;

  protected readonly productos = signal<Producto[]>([]);
  protected readonly busqueda = signal('');
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

  protected readonly visibles = computed(() => {
    const q = normalizar(this.busqueda().trim());
    if (!q) return this.productos();
    return this.productos().filter((p) => normalizar(p.nombre + ' ' + p.codigo + ' ' + p.categoria).includes(q));
  });

  protected readonly agrupados = computed(() => {
    const mapa = new Map<string, Producto[]>();
    for (const p of this.visibles()) {
      const lista = mapa.get(p.categoria) ?? [];
      lista.push(p);
      mapa.set(p.categoria, lista);
    }
    return [...mapa.entries()].map(([categoria, productos]) => ({ categoria, productos }));
  });

  protected readonly leyenda = computed(() => {
    const total = this.productos().length;
    const n = this.visibles().length;
    return n === total ? `${total} productos` : `${n} de ${total} productos`;
  });

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.api.get<{ productos: Producto[] }>('/productos');
      this.productos.set(r.productos);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el catalogo'));
    } finally {
      this.cargando.set(false);
    }
  }
}
