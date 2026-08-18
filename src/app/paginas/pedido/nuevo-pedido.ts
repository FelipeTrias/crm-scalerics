import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { moneda, normalizar } from '../../nucleo/formato';
import type { FichaCliente, Producto } from '../../nucleo/modelos';

interface Renglon {
  producto: Producto;
  cantidad: number;
  precio: number;
}

/**
 * Registro de un pedido.
 *
 * Es una pantalla propia y no un modal: tiene buscador, lista de productos y
 * renglones editables, y todo eso metido en un cuadro flotante en un celular
 * es inusable. Como pantalla, ademas, el boton de atras del telefono hace lo
 * que uno espera.
 *
 * El flujo es: buscar, tocar el producto, ajustar cantidad. Un producto que ya
 * esta en el pedido suma uno en vez de duplicar el renglon.
 */
@Component({
  selector: 'app-nuevo-pedido',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="titulo">
      <div>
        <h2>{{ estado === 'presupuesto' ? 'Nuevo presupuesto' : 'Registrar pedido' }}</h2>
        <p class="secundario">{{ nombreCliente() || 'Cargando...' }}</p>
      </div>
      <a class="boton secundario" [routerLink]="['/clientes', id()]">Cancelar</a>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="columnas">
      <!-- ── Catalogo ── -->
      <section class="caja panel">
        <h3>Productos</h3>
        <input
          type="search"
          placeholder="Buscar producto..."
          aria-label="Buscar producto"
          [ngModel]="busqueda()"
          (ngModelChange)="busqueda.set($event)"
        />

        @if (cargando()) {
          <p class="vacio">Cargando catalogo...</p>
        } @else {
          <ul class="catalogo">
            @for (p of visibles(); track p.id) {
              <li>
                <button type="button" class="fila-producto" (click)="agregar(p)">
                  <span class="datos">
                    <span class="principal">{{ p.nombre }}</span>
                    <span class="secundario">{{ p.codigo }} &middot; {{ p.unidad }}</span>
                  </span>
                  <span class="precio num">{{ moneda(p.precio_lista) }}</span>
                </button>
              </li>
            } @empty {
              <li class="vacio">No hay productos que coincidan.</li>
            }
          </ul>
        }
      </section>

      <!-- ── Pedido ── -->
      <section class="caja panel">
        <h3>El pedido <span class="apagado num">({{ renglones().length }})</span></h3>

        @if (renglones().length === 0) {
          <p class="vacio">Toc&aacute; un producto de la izquierda para agregarlo.</p>
        } @else {
          <ul class="renglones">
            @for (r of renglones(); track r.producto.id; let i = $index) {
              <li>
                <div class="encabezado-renglon">
                  <span class="principal">{{ r.producto.nombre }}</span>
                  <button type="button" class="quitar" (click)="quitar(i)" [attr.aria-label]="'Quitar ' + r.producto.nombre">
                    &times;
                  </button>
                </div>
                <div class="controles">
                  <div class="cantidad">
                    <button type="button" (click)="sumar(i, -1)" aria-label="Restar uno">&minus;</button>
                    <input
                      type="number"
                      min="1"
                      inputmode="numeric"
                      aria-label="Cantidad"
                      [ngModel]="r.cantidad"
                      (ngModelChange)="fijarCantidad(i, $event)"
                    />
                    <button type="button" (click)="sumar(i, 1)" aria-label="Sumar uno">+</button>
                  </div>
                  <label class="precio-unit">
                    <span class="apagado">c/u</span>
                    <input
                      type="number"
                      min="0"
                      inputmode="numeric"
                      aria-label="Precio unitario"
                      [ngModel]="r.precio"
                      (ngModelChange)="fijarPrecio(i, $event)"
                    />
                  </label>
                  <span class="subtotal num">{{ moneda(r.cantidad * r.precio) }}</span>
                </div>
              </li>
            }
          </ul>

          <div class="total">
            <span>Total</span>
            <strong class="num">{{ moneda(total()) }}</strong>
          </div>
        }

        <div class="campos">
          <div class="campo">
            <label class="etiqueta" for="estado">Estado</label>
            <select id="estado" name="estado" [(ngModel)]="estado">
              <option value="presupuesto">Presupuesto &mdash; todav&iacute;a no compr&oacute;</option>
              <option value="confirmado">Confirmado &mdash; ya lo pidi&oacute;</option>
              <option value="entregado">Entregado</option>
            </select>
          </div>
          <div class="campo">
            <label class="etiqueta" for="fecha">Fecha</label>
            <input id="fecha" name="fecha" type="date" [(ngModel)]="fecha" />
          </div>
          <div class="campo ancho">
            <label class="etiqueta" for="notas">Notas <span class="apagado">(opcional)</span></label>
            <input id="notas" name="notas" type="text" [(ngModel)]="notas" />
          </div>
        </div>

        <button type="button" class="boton guardar" (click)="guardar()" [disabled]="renglones().length === 0 || guardando()">
          {{ guardando() ? 'Guardando...' : 'Guardar &mdash; ' + moneda(total()) }}
        </button>
      </section>
    </div>
  `,
  styles: `
    .titulo {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .titulo p {
      margin: 2px 0 0;
    }

    .error {
      margin-bottom: 12px;
    }

    .columnas {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items: start;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
    }

    .panel h3 {
      font-size: 0.95rem;
    }

    .catalogo,
    .renglones {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .catalogo {
      max-height: 460px;
      overflow-y: auto;
    }

    .fila-producto {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: var(--radio);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .fila-producto:hover {
      background: var(--azul-suave);
      border-color: var(--gris-300);
    }

    .datos {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .datos .principal {
      font-size: 0.88rem;
    }

    .precio {
      font-weight: 650;
      font-size: 0.85rem;
      white-space: nowrap;
    }

    .renglones li {
      padding: 8px;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
    }

    .encabezado-renglon {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }

    .encabezado-renglon .principal {
      font-size: 0.88rem;
    }

    .quitar {
      flex: none;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--rojo);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
    }

    .quitar:hover {
      background: var(--rojo-suave);
    }

    .controles {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cantidad {
      display: flex;
      align-items: center;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
      overflow: hidden;
    }

    .cantidad button {
      width: 40px;
      min-height: 40px;
      border: 0;
      background: var(--gris-100);
      color: var(--texto);
      font: inherit;
      font-size: 1.1rem;
      cursor: pointer;
    }

    .cantidad button:hover {
      background: var(--gris-300);
    }

    .cantidad input {
      width: 52px;
      min-height: 40px;
      border: 0;
      border-radius: 0;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .precio-unit {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
    }

    .precio-unit input {
      width: 78px;
      min-height: 40px;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }

    .subtotal {
      margin-left: auto;
      font-weight: 650;
      white-space: nowrap;
    }

    .total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 10px;
      border-top: 2px solid var(--borde);
      font-size: 1.05rem;
    }

    .total strong {
      font-size: 1.4rem;
      color: var(--azul-900);
    }

    .campos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .campo.ancho {
      grid-column: 1 / -1;
    }

    .guardar {
      min-height: 52px;
      font-size: 1rem;
    }

    @media (max-width: 760px) {
      .columnas {
        grid-template-columns: 1fr;
      }

      .catalogo {
        max-height: 300px;
      }

      /* El total y el boton quedan siempre visibles mientras se arma el pedido */
      .guardar {
        position: sticky;
        bottom: 12px;
      }
    }
  `,
})
export class NuevoPedido {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly moneda = moneda;

  protected readonly productos = signal<Producto[]>([]);
  protected readonly renglones = signal<Renglon[]>([]);
  protected readonly busqueda = signal('');
  protected readonly nombreCliente = signal('');
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  // Arranca como presupuesto: primero se cotiza y despues se confirma.
  protected estado = 'presupuesto';
  protected fecha = '';
  protected notas = '';

  protected readonly visibles = computed(() => {
    const q = normalizar(this.busqueda().trim());
    if (!q) return this.productos();
    return this.productos().filter((p) => normalizar(p.nombre + ' ' + p.codigo + ' ' + p.categoria).includes(q));
  });

  protected readonly total = computed(() =>
    this.renglones().reduce((suma, r) => suma + r.cantidad * r.precio, 0),
  );

  constructor() {
    // effect y no el constructor: los inputs de la ruta todavia no estan
    // asignados cuando corre el constructor, asi que this.id() falla ahi.
    effect(() => {
      const id = this.id();
      if (typeof window !== 'undefined') void this.iniciar(id);
    });
  }

  private async iniciar(id: string): Promise<void> {
    this.cargando.set(true);
    try {
      const [cat, ficha] = await Promise.all([
        this.api.get<{ productos: Producto[] }>('/productos'),
        this.api.get<FichaCliente>(`/clientes/${id}`),
      ]);
      this.productos.set(cat.productos);
      this.nombreCliente.set(ficha.cliente.nombre_fantasia || ficha.cliente.razon_social);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el catalogo'));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Si el producto ya esta en el pedido, suma uno en vez de repetir el renglon. */
  protected agregar(p: Producto): void {
    this.renglones.update((lista) => {
      const i = lista.findIndex((r) => r.producto.id === p.id);
      if (i === -1) return [...lista, { producto: p, cantidad: 1, precio: p.precio_lista }];
      const copia = [...lista];
      copia[i] = { ...copia[i], cantidad: copia[i].cantidad + 1 };
      return copia;
    });
  }

  protected quitar(i: number): void {
    this.renglones.update((lista) => lista.filter((_, k) => k !== i));
  }

  protected sumar(i: number, delta: number): void {
    this.renglones.update((lista) => {
      const copia = [...lista];
      copia[i] = { ...copia[i], cantidad: Math.max(1, copia[i].cantidad + delta) };
      return copia;
    });
  }

  protected fijarCantidad(i: number, valor: unknown): void {
    const n = Math.max(1, Math.floor(Number(valor) || 1));
    this.renglones.update((lista) => {
      const copia = [...lista];
      copia[i] = { ...copia[i], cantidad: n };
      return copia;
    });
  }

  protected fijarPrecio(i: number, valor: unknown): void {
    const n = Math.max(0, Number(valor) || 0);
    this.renglones.update((lista) => {
      const copia = [...lista];
      copia[i] = { ...copia[i], precio: n };
      return copia;
    });
  }

  protected async guardar(): Promise<void> {
    if (this.guardando() || this.renglones().length === 0) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.api.post(`/clientes/${this.id()}/pedidos`, {
        estado: this.estado,
        fecha: this.fecha || null,
        notas: this.notas || null,
        items: this.renglones().map((r) => ({
          producto_id: r.producto.id,
          cantidad: r.cantidad,
          precio_unitario: r.precio,
        })),
      });
      await this.router.navigate(['/clientes', this.id()]);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo guardar el pedido'));
    } finally {
      this.guardando.set(false);
    }
  }
}
