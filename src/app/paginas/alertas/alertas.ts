import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { enlaceWhatsapp, fechaCorta } from '../../nucleo/formato';
import { Sesion } from '../../nucleo/sesion';

interface Alerta {
  id: number;
  cliente_id: number;
  razon_social: string;
  nombre_fantasia: string | null;
  vendedor_id: number;
  vendedor_nombre: string;
  tipo: 'sin_contacto' | 'sin_compra' | 'oportunidad_estancada';
  dias_sin_contacto: number | null;
  mensaje: string | null;
  estado: 'pendiente' | 'vista' | 'resuelta';
  generada_en: string;
  whatsapp: string | null;
}

/**
 * Avisos generados por el cron.
 *
 * Es la diferencia entre "el sistema tiene la informacion" y "alguien se
 * entero": la pantalla de riesgo hay que ir a mirarla, esto llega solo.
 */
@Component({
  selector: 'app-alertas',
  imports: [RouterLink],
  template: `
    <div class="titulo">
      <h2>Alertas</h2>
      <span class="apagado num">{{ alertas().length }} pendientes</span>
      @if (sesion.esAdmin()) {
        <button type="button" class="boton secundario revisar" (click)="regenerar()" [disabled]="generando()">
          {{ generando() ? 'Revisando...' : 'Revisar ahora' }}
        </button>
      }
    </div>

    <p class="explicacion">
      Se generan solas todos los d&iacute;as a las 8 de la ma&ntilde;ana.
      @if (ultimoResumen(); as r) {
        <strong>Reci&eacute;n: {{ r }}</strong>
      }
    </p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Cargando alertas...</p>
    } @else if (alertas().length === 0) {
      <p class="vacio">No hay alertas pendientes.</p>
    } @else {
      <div class="lista">
        @for (a of alertas(); track a.id) {
          <article class="alerta" [class]="a.tipo">
            <div class="arriba">
              <div>
                <a class="enlace" [routerLink]="['/clientes', a.cliente_id]">
                  <span class="principal">{{ a.nombre_fantasia || a.razon_social }}</span>
                </a>
                <div class="secundario">
                  {{ etiquetaTipo(a.tipo) }} &middot; {{ fechaCorta(a.generada_en) }}
                  @if (sesion.esAdmin()) { &middot; {{ a.vendedor_nombre }} }
                </div>
              </div>
              <span class="chip rojo num">{{ a.dias_sin_contacto }}<span class="u">d</span></span>
            </div>

            <p class="mensaje">{{ a.mensaje }}</p>

            <div class="acciones">
              @if (enlaceDe(a); as url) {
                <a class="boton whatsapp" [href]="url" target="_blank" rel="noopener">WhatsApp</a>
              }
              <button type="button" class="boton secundario" (click)="marcar(a, 'vista')" [disabled]="tocando() === a.id">
                Vista
              </button>
              <button type="button" class="boton secundario" (click)="marcar(a, 'resuelta')" [disabled]="tocando() === a.id">
                Resuelta
              </button>
            </div>
          </article>
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
      margin-bottom: 8px;
    }

    .revisar {
      margin-left: auto;
      min-height: 38px;
    }

    .explicacion {
      margin: 0 0 12px;
      padding: 10px 12px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-left: 4px solid var(--azul-500);
      border-radius: var(--radio);
      font-size: 0.85rem;
      color: var(--texto-suave);
    }

    .error {
      margin-bottom: 12px;
    }

    .lista {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .alerta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--superficie);
      border: 1px solid var(--borde);
      border-left: 4px solid var(--rojo);
      border-radius: var(--radio);
    }

    .alerta.sin_compra {
      border-left-color: var(--amarillo);
    }

    .arriba {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }

    .enlace {
      color: inherit;
      text-decoration: none;
    }

    .enlace:hover .principal {
      color: var(--azul-700);
      text-decoration: underline;
    }

    .mensaje {
      margin: 0;
      font-size: 0.9rem;
    }

    .acciones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .acciones .boton {
      min-width: 120px;
      text-decoration: none;
    }

    /* En el celular si ocupan todo: ahi el ancho es escaso y se toca con el dedo */
    @media (max-width: 760px) {
      .acciones .boton {
        flex: 1;
        min-width: 0;
      }
    }
  `,
})
export class Alertas {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);
  protected readonly fechaCorta = fechaCorta;

  protected readonly alertas = signal<Alerta[]>([]);
  protected readonly cargando = signal(true);
  protected readonly generando = signal(false);
  protected readonly tocando = signal<number | null>(null);
  protected readonly ultimoResumen = signal('');
  protected readonly error = signal('');

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  protected etiquetaTipo(tipo: Alerta['tipo']): string {
    if (tipo === 'sin_compra') return 'Dejo de comprar';
    if (tipo === 'oportunidad_estancada') return 'Oportunidad estancada';
    return 'Sin contacto';
  }

  protected enlaceDe(a: Alerta): string | null {
    const dias = a.dias_sin_contacto ?? 0;
    const cuanto = a.tipo === 'sin_compra' ? `hace ${dias} dias` : 'hace un tiempo';
    return enlaceWhatsapp(
      a.whatsapp,
      `Hola, como va? Soy de Scalerics. Vi que no les mandamos insumos ${cuanto} ` +
        `y queria saber como andan de stock para dejarles una cotizacion al dia. ` +
        `Te paso a visitar esta semana?`,
    );
  }

  protected async marcar(a: Alerta, estado: 'vista' | 'resuelta'): Promise<void> {
    this.tocando.set(a.id);
    try {
      await this.api.patch(`/alertas/${a.id}`, { estado });
      this.alertas.update((lista) => lista.filter((x) => x.id !== a.id));
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo marcar la alerta'));
    } finally {
      this.tocando.set(null);
    }
  }

  protected async regenerar(): Promise<void> {
    this.generando.set(true);
    this.error.set('');
    try {
      const r = await this.api.post<{ sin_contacto: number; sin_compra: number }>('/alertas/generar', {});
      this.ultimoResumen.set(`${r.sin_contacto} por falta de contacto, ${r.sin_compra} por falta de compra`);
      await this.cargar();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron generar las alertas'));
    } finally {
      this.generando.set(false);
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await this.api.get<{ alertas: Alerta[] }>('/alertas');
      this.alertas.set(r.alertas);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar las alertas'));
    } finally {
      this.cargando.set(false);
    }
  }
}
