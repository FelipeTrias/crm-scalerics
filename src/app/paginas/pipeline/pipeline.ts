import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';

interface OportunidadLista {
  id: number;
  cliente_id: number;
  razon_social: string;
  nombre_fantasia: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  titulo: string;
  monto_estimado: number | null;
  moneda: 'UYU' | 'USD';
  etapa: string;
  fecha_cierre_estimada: string | null;
}

interface ResumenEtapa {
  etapa: string;
  cantidad: number;
  monto_total: number;
}

/**
 * Pipeline por etapas.
 *
 * Responde a "hoy eso me lo dicen de palabra en la reunion de los lunes y
 * siempre esta todo en proceso, nunca se bien". Las etapas son cerradas y cada
 * columna muestra cuantas oportunidades hay y cuanta plata representan.
 *
 * El cambio de etapa es un <select>, no arrastrar y soltar: funciona igual en
 * el celular, que es donde se usa, y no depende de ninguna libreria.
 */
@Component({
  selector: 'app-pipeline',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="titulo">
      <h2>Pipeline</h2>
      <span class="apagado num">{{ totalAbiertas() }} abiertas &middot; {{ moneda(totalMonto()) }}</span>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando pipeline...</p>
    } @else {
      <div class="tablero desplazable">
        @for (e of ETAPAS; track e.valor) {
          <section class="columna">
            <header class="cabecera-col" [class]="e.valor">
              <div class="nombre">{{ e.texto }}</div>
              <div class="cifras num">
                <span class="cantidad">{{ resumenDe(e.valor).cantidad }}</span>
                <span class="monto">{{ moneda(resumenDe(e.valor).monto_total) }}</span>
              </div>
            </header>

            <div class="pila">
              @for (o of porEtapa()[e.valor]; track o.id) {
                <article class="oportunidad">
                  <a class="enlace" [routerLink]="['/clientes', o.cliente_id]">
                    <div class="principal">{{ o.nombre_fantasia || o.razon_social }}</div>
                  </a>
                  <div class="secundario">{{ o.titulo }}</div>
                  <div class="pie">
                    <span class="num plata">{{ moneda(o.monto_estimado ?? 0) }}</span>
                    @if (sesion.esAdmin()) {
                      <span class="secundario">{{ o.vendedor_nombre }}</span>
                    }
                  </div>
                  <select
                    aria-label="Cambiar etapa"
                    [ngModel]="o.etapa"
                    (ngModelChange)="cambiarEtapa(o, $event)"
                    [disabled]="moviendo() === o.id"
                  >
                    @for (x of ETAPAS; track x.valor) {
                      <option [value]="x.valor">{{ x.texto }}</option>
                    }
                  </select>
                </article>
              } @empty {
                <p class="apagado sin-nada">Sin oportunidades</p>
              }
            </div>
          </section>
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

    .error {
      margin-bottom: 12px;
    }

    /* En escritorio entran las seis columnas; en celular se arrastra de
       costado, dentro del tablero y no del body. */
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
      background: var(--azul-700);
      color: #fff;
    }

    .cabecera-col.ganado {
      background: var(--verde);
    }

    .cabecera-col.perdido {
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

    .oportunidad {
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
      font-size: 0.9rem;
    }

    .oportunidad select {
      min-height: 38px;
      font-size: 0.82rem;
      padding: 0 8px;
    }

    .sin-nada {
      padding: 10px;
      font-size: 0.82rem;
      text-align: center;
    }

    @media (max-width: 760px) {
      .tablero {
        grid-auto-columns: 78vw;
      }

      .oportunidad select {
        min-height: 44px;
      }
    }
  `,
})
export class Pipeline {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);

  protected readonly ETAPAS = [
    { valor: 'nuevo', texto: 'Nuevo' },
    { valor: 'contactado', texto: 'Contactado' },
    { valor: 'presupuesto_enviado', texto: 'Presupuesto enviado' },
    { valor: 'negociacion', texto: 'Negociacion' },
    { valor: 'ganado', texto: 'Ganado' },
    { valor: 'perdido', texto: 'Perdido' },
  ] as const;

  protected readonly oportunidades = signal<OportunidadLista[]>([]);
  protected readonly resumen = signal<ResumenEtapa[]>([]);
  protected readonly cargando = signal(true);
  protected readonly moviendo = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly porEtapa = computed(() => {
    const mapa: Record<string, OportunidadLista[]> = {};
    for (const e of this.ETAPAS) mapa[e.valor] = [];
    for (const o of this.oportunidades()) mapa[o.etapa]?.push(o);
    return mapa;
  });

  /** Solo lo que sigue en juego: ganado y perdido ya no son pipeline. */
  protected readonly totalAbiertas = computed(
    () => this.oportunidades().filter((o) => o.etapa !== 'ganado' && o.etapa !== 'perdido').length,
  );

  protected readonly totalMonto = computed(() =>
    this.oportunidades()
      .filter((o) => o.etapa !== 'ganado' && o.etapa !== 'perdido')
      .reduce((suma, o) => suma + (o.monto_estimado ?? 0), 0),
  );

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  protected moneda(valor: number): string {
    return '$ ' + Math.round(valor).toLocaleString('es-UY');
  }

  protected resumenDe(etapa: string): ResumenEtapa {
    return this.resumen().find((r) => r.etapa === etapa) ?? { etapa, cantidad: 0, monto_total: 0 };
  }

  protected async cambiarEtapa(o: OportunidadLista, etapa: string): Promise<void> {
    if (etapa === o.etapa) return;
    this.moviendo.set(o.id);
    this.error.set('');
    try {
      await this.api.patch(`/oportunidades/${o.id}`, { etapa });
      // Se recarga entero: al pasar a ganado el servidor sella la fecha de
      // cierre, y de eso dependen los dias sin compra del cliente.
      await this.cargar();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cambiar la etapa'));
    } finally {
      this.moviendo.set(null);
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.api.get<{ oportunidades: OportunidadLista[]; resumen: ResumenEtapa[] }>('/oportunidades');
      this.oportunidades.set(r.oportunidades);
      this.resumen.set(r.resumen);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo cargar el pipeline'));
    } finally {
      this.cargando.set(false);
    }
  }
}
