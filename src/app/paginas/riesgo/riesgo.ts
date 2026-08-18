import { Component, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, mensajeDeError } from '../../nucleo/api';
import { colorCompra, colorContacto, enlaceWhatsapp, fechaCorta } from '../../nucleo/formato';
import type { Cliente } from '../../nucleo/modelos';
import { Sesion } from '../../nucleo/sesion';

/**
 * Clientes en riesgo.
 *
 * Es la pantalla que resuelve el reclamo mas fuerte del cliente: "tengo
 * clientes que compraban todos los meses y hace medio año no compran y nadie
 * se dio cuenta".
 *
 * Muestra las dos causas juntas porque no son la misma cosa: se puede haber
 * visitado a alguien la semana pasada y que no compre hace ocho meses. El
 * servidor las ordena por la peor de las dos, para que ese caso no quede al
 * fondo de la lista.
 *
 * Antes habia dos pantallas: esta y una de alertas, con los mismos clientes.
 * Para alguien que no es de la computadora eso es una pantalla de mas, asi que
 * se unificaron: la lista se calcula en vivo, y lo que antes era "marcar la
 * alerta" ahora es el boton "Ya lo atendi" de cada fila, que la silencia unos
 * dias. El cron sigue corriendo: lo que deja se ve como el cartel "nuevo".
 */
@Component({
  selector: 'app-riesgo',
  imports: [RouterLink],
  template: `
    <div class="titulo">
      <h2>Clientes en riesgo</h2>
      <span class="apagado num">{{ leyenda() }}</span>
      @if (atendidos().length > 0) {
        <button type="button" class="boton secundario chico" (click)="verAtendidos.set(!verAtendidos())">
          {{ verAtendidos() ? 'Ocultar' : 'Ver' }} {{ atendidos().length }}
          {{ atendidos().length === 1 ? 'atendido' : 'atendidos' }}
        </button>
      }
    </div>

    <p class="explicacion">
      Un cliente entra ac&aacute; por <strong>m&aacute;s de 60 d&iacute;as sin contacto</strong> o por
      <strong>m&aacute;s de 180 d&iacute;as sin comprar</strong>. Las dos cosas no siempre pasan juntas.
      Con <strong>Ya lo atend&iacute;</strong> la fila se guarda una semana; si el cliente sigue igual, vuelve.
    </p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Buscando clientes en riesgo...</p>
    } @else if (visibles().length === 0) {
      <p class="vacio">
        @if (atendidos().length > 0) {
          No queda nada sin atender.
          @if (atendidos().length === 1) {
            El que falta ya lo marcaste.
          } @else {
            Los {{ atendidos().length }} que faltan ya los marcaste.
          }
        } @else {
          No hay clientes en riesgo. Toda la cartera est&aacute; al d&iacute;a.
        }
      </p>
    }

    @if (visibles().length > 0) {
      <!-- Escritorio -->
      <div class="caja solo-escritorio">
        <div class="desplazable">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                @if (sesion.esAdmin()) {
                  <th>Vendedor</th>
                }
                <th>Sin contacto</th>
                <th>Sin compra</th>
                <th>&Uacute;ltimo contacto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (c of visibles(); track c.id) {
                <tr [class]="gravedad(c)" [class.atendido]="c.atendido">
                  <td>
                    <a class="enlace" [routerLink]="['/clientes', c.id]">
                      <span class="principal">{{ c.nombre_fantasia || c.razon_social }}</span>
                    </a>
                    @if (c.avisos_nuevos && !c.atendido) {
                      <span class="nuevo">nuevo</span>
                    }
                    <div class="secundario">{{ motivo(c) }}</div>
                  </td>
                  @if (sesion.esAdmin()) {
                    <td>{{ c.vendedor_nombre }}</td>
                  }
                  <td>
                    <span class="chip" [class]="colorContacto(c.dias_sin_contacto)">
                      {{ c.dias_sin_contacto }}<span class="u">d</span>
                    </span>
                  </td>
                  <td>
                    @if (c.dias_sin_compra === null) {
                      <span class="chip neutro">nunca</span>
                    } @else {
                      <span class="chip" [class]="colorCompra(c.dias_sin_compra)">
                        {{ c.dias_sin_compra }}<span class="u">d</span>
                      </span>
                    }
                  </td>
                  <td class="apagado">{{ fechaCorta(c.ultima_interaccion) }}</td>
                  <td class="acciones">
                    @if (enlaceDe(c); as url) {
                      <a class="boton whatsapp compacto" [href]="url" target="_blank" rel="noopener">WhatsApp</a>
                    }
                    @if (!c.atendido) {
                      <button
                        type="button"
                        class="boton secundario compacto"
                        (click)="atender(c)"
                        [disabled]="marcando() === c.id"
                      >
                        Ya lo atend&iacute;
                      </button>
                    } @else {
                      <span class="apagado marca-atendido">atendido</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Celular -->
      <div class="tarjetas solo-celular">
        @for (c of visibles(); track c.id) {
          <article class="tarjeta" [class]="gravedad(c)" [class.atendido]="c.atendido">
            <a class="enlace" [routerLink]="['/clientes', c.id]">
              <div class="arriba">
                <div>
                  <div class="principal">
                    {{ c.nombre_fantasia || c.razon_social }}
                    @if (c.avisos_nuevos && !c.atendido) {
                      <span class="nuevo">nuevo</span>
                    }
                  </div>
                  <div class="secundario">
                    {{ c.contacto_principal || 'sin contacto cargado' }}@if (sesion.esAdmin()) { · {{ c.vendedor_nombre }} }
                  </div>
                </div>
                <span class="motivo">{{ motivo(c) }}</span>
              </div>
            </a>
            <div class="abajo">
              <span class="secundario">Sin contacto</span>
              <span class="chip" [class]="colorContacto(c.dias_sin_contacto)">
                {{ c.dias_sin_contacto }}<span class="u">d</span>
              </span>
              <span class="secundario">Sin comprar</span>
              @if (c.dias_sin_compra === null) {
                <span class="chip neutro">nunca</span>
              } @else {
                <span class="chip" [class]="colorCompra(c.dias_sin_compra)">
                  {{ c.dias_sin_compra }}<span class="u">d</span>
                </span>
              }
            </div>
            <div class="botones">
              @if (enlaceDe(c); as url) {
                <a class="boton whatsapp" [href]="url" target="_blank" rel="noopener">WhatsApp</a>
              }
              @if (!c.atendido) {
                <button type="button" class="boton secundario" (click)="atender(c)" [disabled]="marcando() === c.id">
                  Ya lo atend&iacute;
                </button>
              }
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

    .boton.chico {
      min-height: 34px;
      padding: 0 12px;
      font-size: 0.8rem;
      margin-left: auto;
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

    .explicacion strong {
      color: var(--texto);
    }

    .error {
      margin-bottom: 12px;
    }

    .enlace {
      color: inherit;
      text-decoration: none;
    }

    .enlace:hover .principal {
      color: var(--azul-700);
      text-decoration: underline;
    }

    /* Franja de gravedad: se lee antes que el numero */
    tbody tr.grave,
    .tarjeta.grave {
      border-left: 4px solid var(--rojo);
    }

    tbody tr.media,
    .tarjeta.media {
      border-left: 4px solid var(--amarillo);
    }

    /* Ya atendido: sigue en riesgo, pero alguien se hizo cargo */
    tbody tr.atendido,
    .tarjeta.atendido {
      opacity: 0.55;
    }

    /* Lo que dejo el cron y nadie miro todavia */
    .nuevo {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--rojo);
      color: #fff;
      font-size: 0.64rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      vertical-align: 1px;
    }

    .motivo {
      flex: none;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--azul-suave);
      color: var(--azul-700);
      font-size: 0.66rem;
      font-weight: 650;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      text-align: center;
    }

    .acciones {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .boton.compacto {
      min-height: 34px;
      padding: 0 10px;
      font-size: 0.78rem;
      text-decoration: none;
      white-space: nowrap;
    }

    .marca-atendido {
      font-size: 0.75rem;
      font-style: italic;
    }

    .botones {
      display: flex;
      gap: 8px;
    }

    .botones .boton {
      flex: 1;
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
export class Riesgo {
  private readonly api = inject(Api);
  protected readonly sesion = inject(Sesion);

  protected readonly colorContacto = colorContacto;
  protected readonly colorCompra = colorCompra;
  protected readonly fechaCorta = fechaCorta;

  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly verAtendidos = signal(false);
  protected readonly cargando = signal(true);
  protected readonly marcando = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly atendidos = computed(() => this.clientes().filter((c) => c.atendido));

  /** Los atendidos se esconden salvo que se pidan: son ruido para el que trabaja. */
  protected readonly visibles = computed(() =>
    this.verAtendidos() ? this.clientes() : this.clientes().filter((c) => !c.atendido),
  );

  protected readonly leyenda = computed(() => {
    const sinAtender = this.clientes().length - this.atendidos().length;
    const nuevos = this.clientes().filter((c) => c.avisos_nuevos && !c.atendido).length;
    const base = `${sinAtender} sin atender`;
    if (nuevos === 0) return base;
    return `${base} · ${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}`;
  });

  constructor() {
    afterNextRender(() => void this.cargar());
  }

  /** Por que aparece en la lista. Es lo primero que pregunta quien la mira. */
  protected motivo(c: Cliente): string {
    const sinContacto = c.dias_sin_contacto > 60;
    const sinCompra = (c.dias_sin_compra ?? 0) > 180;
    if (sinContacto && sinCompra) return 'sin contacto y sin compra';
    if (sinContacto) return 'sin contacto';
    return 'dejo de comprar';
  }

  protected gravedad(c: Cliente): string {
    const peor = Math.max(c.dias_sin_contacto, c.dias_sin_compra ?? 0);
    return peor >= 180 ? 'grave' : 'media';
  }

  protected enlaceDe(c: Cliente): string | null {
    const nombre = (c.contacto_principal ?? '').split(' ')[0];
    const dias = c.dias_sin_compra;
    const cuanto = dias === null ? 'hace un tiempo' : `hace ${dias} dias`;
    return enlaceWhatsapp(
      c.whatsapp ?? null,
      `Hola ${nombre}, como va? Soy de Scalerics. Vi que no les mandamos insumos ${cuanto} ` +
        `y queria saber como andan de stock para dejarles una cotizacion al dia. ` +
        `Te paso a visitar esta semana?`,
    );
  }

  protected async atender(c: Cliente): Promise<void> {
    this.marcando.set(c.id);
    this.error.set('');
    try {
      await this.api.post(`/clientes/${c.id}/atendido`, {});
      await this.cargar();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo marcar como atendido'));
    } finally {
      this.marcando.set(null);
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const r = await this.api.get<{ clientes: Cliente[] }>('/clientes', { riesgo: true });
      this.clientes.set(r.clientes);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudieron cargar los clientes en riesgo'));
    } finally {
      this.cargando.set(false);
    }
  }
}
