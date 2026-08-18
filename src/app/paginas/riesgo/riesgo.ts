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
 */
@Component({
  selector: 'app-riesgo',
  imports: [RouterLink],
  template: `
    <div class="titulo">
      <h2>Clientes en riesgo</h2>
      <span class="apagado num">{{ clientes().length }} clientes</span>
    </div>

    <p class="explicacion">
      Un cliente entra ac&aacute; por <strong>m&aacute;s de 60 d&iacute;as sin contacto</strong> o por
      <strong>m&aacute;s de 180 d&iacute;as sin comprar</strong>. Las dos cosas no siempre pasan juntas.
    </p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="vacio">Buscando clientes en riesgo...</p>
    } @else if (clientes().length === 0) {
      <p class="vacio">No hay clientes en riesgo. Toda la cartera est&aacute; al d&iacute;a.</p>
    } @else {
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
              @for (c of clientes(); track c.id) {
                <tr [class]="gravedad(c)">
                  <td>
                    <a class="enlace" [routerLink]="['/clientes', c.id]">
                      <span class="principal">{{ c.nombre_fantasia || c.razon_social }}</span>
                    </a>
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
                  <td>
                    @if (enlaceDe(c); as url) {
                      <a class="boton whatsapp compacto" [href]="url" target="_blank" rel="noopener">WhatsApp</a>
                    } @else {
                      <span class="apagado sin-tel">sin tel&eacute;fono</span>
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
        @for (c of clientes(); track c.id) {
          <article class="tarjeta" [class]="gravedad(c)">
            <a class="enlace" [routerLink]="['/clientes', c.id]">
              <div class="arriba">
                <div>
                  <div class="principal">{{ c.nombre_fantasia || c.razon_social }}</div>
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
            @if (enlaceDe(c); as url) {
              <a class="boton whatsapp" [href]="url" target="_blank" rel="noopener">Enviar WhatsApp</a>
            }
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

    .boton.compacto {
      min-height: 36px;
      padding: 0 12px;
      font-size: 0.8rem;
      text-decoration: none;
    }

    .boton.whatsapp {
      text-decoration: none;
    }

    .sin-tel {
      font-size: 0.78rem;
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
  protected readonly cargando = signal(true);
  protected readonly error = signal('');

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
