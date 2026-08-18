import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { mensajeDeError } from '../../nucleo/api';
import { Sesion } from '../../nucleo/sesion';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="pantalla">
      <form class="tarjeta-login" (ngSubmit)="entrar()">
        <div class="cabecera">
          <div class="logo" aria-hidden="true">S</div>
          <div>
            <h1>Scalerics</h1>
            <p class="apagado">Gestion de clientes</p>
          </div>
        </div>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <div class="campo">
          <label class="etiqueta" for="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="username"
            inputmode="email"
            required
            [(ngModel)]="email"
            [disabled]="cargando()"
          />
        </div>

        <div class="campo">
          <label class="etiqueta" for="password">Contrase&ntilde;a</label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            [(ngModel)]="password"
            [disabled]="cargando()"
          />
        </div>

        <button class="boton" type="submit" [disabled]="cargando()">
          {{ cargando() ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .pantalla {
      display: grid;
      place-items: center;
      min-height: 100dvh;
      padding: 20px;
      background: linear-gradient(160deg, var(--azul-900), var(--azul-700));
    }

    .tarjeta-login {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      max-width: 380px;
      padding: 24px;
      background: var(--superficie);
      border-radius: 12px;
      box-shadow: var(--sombra);
    }

    .cabecera {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Espacio reservado: el logo real lo manda el cliente */
    .logo {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      flex: none;
      border-radius: 50%;
      background: var(--azul-500);
      color: #fff;
      font-weight: 700;
      font-size: 1.3rem;
    }

    .cabecera p {
      margin: 0;
      font-size: 0.85rem;
    }
  `,
})
export class Login {
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly cargando = signal(false);
  readonly error = signal('');

  async entrar(): Promise<void> {
    if (this.cargando()) return;
    this.error.set('');
    this.cargando.set(true);
    try {
      await this.sesion.iniciar(this.email, this.password);
      await this.router.navigate(['/clientes']);
    } catch (e) {
      this.error.set(mensajeDeError(e, 'No se pudo iniciar sesion'));
    } finally {
      this.cargando.set(false);
    }
  }
}
