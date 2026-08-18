import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { fechaCorta, moneda } from '../../nucleo/formato';
import type { EstadoPedido } from '../../nucleo/modelos';
import { Sesion } from '../../nucleo/sesion';

interface PedidoTablero {
  id: number;
  cliente_id: number;
  razon_social: string;
  nombre_fantasia: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  fecha: string;
  estado: EstadoPedido;
  notas: string | null;
  total: number;
  renglones: number;
}

interface ResumenEstado {
  estado: EstadoPedido;
  cantidad: number;
  monto_total: number;
}

/**
 * Pipeline de ventas.
 *
 * Responde a "hoy eso me lo dicen de palabra en la reunion de los lunes y
 * siempre esta todo en proceso, nunca se bien".
 *
 * Cada tarjeta es un pedido de verdad. Antes eran "oportunidades" con un titulo
 * escrito a mano y un monto inventado: se veian presupuestos de $123.000 para
 * clientes que compran $20.000. Ahora el monto sale de los renglones, asi que
 * lo que muestra cada columna es plata que existe.
 *
 * El cambio de estado es un <select>, no arrastrar y soltar: funciona igual con
 * el dedo, que es donde se usa, y no suma dependencias.
 */
@Component({
  selector: 'app-pipeline',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="titulo">
      <h2>Pipeline</h2>
      <span class="apagado num">
        {{ resumenDe('presupuesto').cantidad }} presupuestos sin responder &middot;
        {{ moneda(resumenDe('presupuesto').monto_total) }}
      </span>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando pipeline...</p>
    } @else {
      <div class="tablero desplazable">
        @for (e of ESTADOS; track e.valor) {
          <section class="columna">
            <header class="cabecera-col" [class]="e.valor">
              <div class="nombre">{{ e.texto }}</div>
              <div class="cifras num">
                <span class="cantidad">{{ resumenDe(e.valor).cantidad }}</span>
                <span class="monto">{{ moneda(resumenDe(e.valor).monto_total) }}</span>
              </div>
            </header>

            <div class="pila">
              @for (p of porEstado()[e.valor]; track p.id) {
                <article class="pedido">
                  <a class="enlace" [routerLink]="['/clientes', p.cliente_id]">
                    <div class="principal">{{ p.nombre_fantasia || p.razon_social }}</div>
                  </a>
                  <div class="pie">
                    <span class="num plata">{{ moneda(p.total) }}</span>
                    <span class="secundario num">{{ p.renglones }} prod. &middot; {{ fechaCorta(p.fecha) }}</span>
                  </div>
                  @if (sesion.esAdmin()) {
                    <div class="secundario">{{ p.vendedor_nombre }}</div>
                  }
                  @if (p.notas) {
                    <div class="secundario motivo">{{ p.notas }}</div>
                  }
                  <select
                    aria-label="Cambiar estado"
                    [ngModel]="p.estado"
                    (ngModelChange)="cambiarEstado(p, $event)"
                    [disabled]="moviendo() === p.id"
                  >
                    @for (x of ESTADOS; track x.valor) {
                      <option [value]="x.valor">{{ x.texto }}</option>
                    }
                  </select>
                </article>
              } @empty {
                <p class="apagado sin-nada">Nada por ac&aacute;</p>
              }
            </div>
          </section>
        }
      </div>

      <p class="nota apagado">
        Los presupuestos y los pedidos confirmados se muestran todos. Los cerrados
        (entregados, perdidos y anulados) se limitan a los &uacute;ltimos {{ diasCerrados() }} d&iacute;as.
      </p>
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

    .error {
      margin-bottom: 12px;
    }

    .tablero {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(190px, 1fr);
      gap: 10px;
      padding-bottom: 8px;
      align-items: start;
    }

    .columna {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .cabecera-col {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radio);
      background: var(--azul-500);
      color: #fff;
    }

    /* El color cuenta la historia: azul lo que esta en juego, verde lo cerrado
       bien, gris lo que ya no sigue. */
    .cabecera-col.presupuesto {
      background: var(--azul-700);
    }

    .cabecera-col.confirmado {
      background: var(--azul-500);
    }

    .cabecera-col.entregado {
      background: var(--verde);
    }

    .cabecera-col.perdido,
    .cabecera-col.anulado {
      background: var(--gris-700);
    }

    .cabecera-col .nombre {
      font-size: 0.78rem;
      font-weight: 650;
      letter-spacing: 0.02em;
    }

    .cifras {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.15;
    }

    .cantidad {
      font-size: 1rem;
      font-weight: 700;
    }

    .monto {
      font-size: 0.68rem;
      opacity: 0.85;
    }

    .pila {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .pedido {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-radius: var(--radio);
    }

    .enlace {
      color: inherit;
      text-decoration: none;
    }

    .enlace:hover .principal {
      color: var(--azul-700);
      text-decoration: underline;
    }

    .pie {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .plata {
      font-weight: 650;
      font-size: 0.95rem;
    }

    .motivo {
      font-style: italic;
    }

    .pedido select {
      min-height: 38px;
      font-size: 0.82rem;
      padding: 0 8px;
    }

    .sin-nada {
      padding: 10px;
      font-size: 0.82rem;
      text-align: center;
    }

    .nota {
      margin: 10px 0 0;
      font-size: 0.75rem;
    }

    @media (max-width: 760px) {
      .tablero {
        grid-auto-columns: 78vw;
      }

      .pedido select {
        min-height: 44px;
      }
    }
  `,
})
export class Pipeline {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);

  protected readonly moneda = moneda;
  protected readonly fechaCorta = fechaCorta;

  protected readonly ESTADOS = [
    { valor: 'presupuesto', texto: 'Presupuesto' },
    { valor: 'confirmado', texto: 'Confirmado' },
    { valor: 'entregado', texto: 'Entregado' },
    { valor: 'perdido', texto: 'Perdido' },
    { valor: 'anulado', texto: 'Anulado' },
  ] as const;

  protected readonly pedidos = signal<PedidoTablero[]>([]);
  protected readonly resumen = signal<ResumenEstado[]>([]);
  protected readonly diasCerrados = signal(60);
  protected readonly cargando = signal(true);
  protected readonly moviendo = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly porEstado = computed(() => {
    const mapa: Record<string, PedidoTablero[]> = {};
    for (const e of this.ESTADOS) mapa[e.valor] = [];
    for (const p of this.pedidos()) mapa[p.estado]?.push(p);
    return mapa;
  });

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  protected resumenDe(estado: string): ResumenEstado {
    return (
      this.resumen().find((r) => r.estado === estado) ?? {
        estado: estado as EstadoPedido,
        cantidad: 0,
        monto_total: 0,
      }
    );
  }

  protected async cambiarEstado(p: PedidoTablero, estado: string): Promise<void> {
    if (estado === p.estado) return;
    this.moviendo.set(p.id);
    this.error.set('');
    try {
      await this.api.patch(`/pedidos/${p.id}`, { estado });
      // Se recarga entero: confirmar un presupuesto cambia los dias sin compra
      // del cliente, y los totales de dos columnas a la vez.
      await this.cargar();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cambiar el estado'));
    } finally {
      this.moviendo.set(null);
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.api.get<{
        pedidos: PedidoTablero[];
        resumen: ResumenEstado[];
        dias_cerrados: number;
      }>('/pipeline');
      this.pedidos.set(r.pedidos);
      this.resumen.set(r.resumen);
      this.diasCerrados.set(r.dias_cerrados);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el pipeline'));
    } finally {
      this.cargando.set(false);
    }
  }
}
