import { Component, ElementRef, inject, input, output, signal, viewChild, type WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeDeError } from '../../nucleo/api';

/**
 * Registro de un contacto con el cliente.
 *
 * Este formulario decide si el sistema se usa o no. El vendedor lo completa
 * parado en la calle, con una mano, entre dos visitas. Tiene que llevarle
 * menos de 15 segundos.
 *
 * Por eso todo se elige tocando: nada de listas desplegables. Cuatro campos,
 * uno solo obligatorio, y pocas opciones por campo. Escribir a mano es
 * opcional. Si el formulario crece, nadie lo llena y el CRM vuelve a ser el
 * Excel de cada uno.
 */
@Component({
  selector: 'app-registrar-contacto',
  imports: [FormsModule],
  template: `
    <dialog #dlg (close)="cerrado()">
      <form class="formulario" (ngSubmit)="guardar()">
        <h2>Registrar contacto</h2>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <div class="campo">
          <span class="etiqueta">&iquest;Qu&eacute; hiciste?</span>
          <div class="tipos">
            @for (t of TIPOS; track t.valor) {
              <button
                type="button"
                class="tipo"
                [class.elegido]="tipo() === t.valor"
                [attr.aria-pressed]="tipo() === t.valor"
                (click)="tipo.set(t.valor)"
              >
                {{ t.texto }}
              </button>
            }
          </div>
        </div>

        <div class="campo">
          <span class="etiqueta">&iquest;C&oacute;mo sali&oacute;?</span>
          <div class="opciones">
            @for (r of RESULTADOS; track r) {
              <button
                type="button"
                class="tipo"
                [class.elegido]="resultado() === r"
                [attr.aria-pressed]="resultado() === r"
                (click)="alternar(resultado, r)"
              >
                {{ r }}
              </button>
            }
          </div>
        </div>

        <div class="campo">
          <label class="etiqueta" for="notas">Notas <span class="apagado">(opcional)</span></label>
          <textarea id="notas" name="notas" rows="2" [(ngModel)]="notas"></textarea>
        </div>

        <div class="campo">
          <span class="etiqueta">&iquest;Qu&eacute; queda pendiente? <span class="apagado">(opcional)</span></span>
          <div class="opciones">
            @for (p of PROXIMAS; track p) {
              <button
                type="button"
                class="tipo"
                [class.elegido]="proximaAccion() === p"
                [attr.aria-pressed]="proximaAccion() === p"
                (click)="alternar(proximaAccion, p)"
              >
                {{ p }}
              </button>
            }
          </div>
          @if (proximaAccion()) {
            <input type="date" name="proximaFecha" aria-label="Cuando" [(ngModel)]="proximaFecha" />
          }
        </div>

        <div class="acciones">
          <button type="button" class="boton secundario" (click)="cerrar()" [disabled]="guardando()">
            Cancelar
          </button>
          <button type="submit" class="boton" [disabled]="guardando()">
            {{ guardando() ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(480px, calc(100% - 24px));
      padding: 0;
      border: 1px solid var(--borde);
      border-radius: 12px;
      background: var(--superficie);
      color: var(--texto);
    }

    dialog::backdrop {
      background: rgb(11 37 69 / 0.45);
    }

    .formulario {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px;
    }

    .tipos {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    /* Envuelve sola: en un celular entran tres por fila, en escritorio las cinco */
    .opciones {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(102px, 1fr));
      gap: 6px;
    }

    .tipo {
      min-height: 52px;
      padding: 0 4px;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
      background: var(--superficie);
      color: var(--texto);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }

    .tipo.elegido {
      background: var(--azul-700);
      border-color: var(--azul-700);
      color: #fff;
    }

    .acciones {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .acciones .boton {
      flex: 1;
    }

    @media (max-width: 760px) {
      dialog {
        width: 100%;
        max-width: none;
        margin: auto auto 0;
        border-radius: 12px 12px 0 0;
      }
    }
  `,
})
export class RegistrarContacto {
  private readonly api = inject(Api);

  readonly clienteId = input.required<number>();
  readonly registrado = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly TIPOS = [
    { valor: 'llamada', texto: 'Llamada' },
    { valor: 'visita', texto: 'Visita' },
    { valor: 'whatsapp', texto: 'WhatsApp' },
    { valor: 'email', texto: 'Email' },
  ] as const;

  /**
   * Cinco resultados, no diez.
   *
   * La lista anterior tenia matices que solo importan a quien diseño el
   * sistema ("pidio muestra" contra "solo consulta de precios"). Para el
   * vendedor son todos "todavia no compro". Menos opciones y mas grandes se
   * eligen de un toque; una lista larga obliga a leer y decidir, y ahi es
   * donde se deja de registrar.
   */
  protected readonly RESULTADOS = ['Compro', 'Pidio precio', 'Lo va a pensar', 'No estaba', 'Reclamo'];

  protected readonly PROXIMAS = ['Llamar', 'Visitar', 'Pasar precio'];

  protected readonly tipo = signal<string>('llamada');
  protected readonly resultado = signal('');
  protected readonly proximaAccion = signal('');
  protected notas = '';
  protected proximaFecha = '';

  /** Tocar la opcion ya elegida la desmarca: no hace falta un "sin especificar". */
  protected alternar(destino: WritableSignal<string>, valor: string): void {
    destino.set(destino() === valor ? '' : valor);
  }

  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  abrir(): void {
    this.tipo.set('llamada');
    this.resultado.set('');
    this.proximaAccion.set('');
    this.notas = '';
    this.proximaFecha = '';
    this.error.set('');
    this.dlg().nativeElement.showModal();
  }

  protected cerrar(): void {
    this.dlg().nativeElement.close();
  }

  protected cerrado(): void {
    this.guardando.set(false);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.api.post(`/clientes/${this.clienteId()}/interacciones`, {
        tipo: this.tipo(),
        resultado: this.resultado() || null,
        notas: this.notas || null,
        proxima_accion: this.proximaAccion() || null,
        proxima_accion_fecha: this.proximaAccion() ? this.proximaFecha || null : null,
      });
      this.cerrar();
      this.registrado.emit();
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo registrar el contacto'));
    } finally {
      this.guardando.set(false);
    }
  }
}
