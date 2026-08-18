import { Routes } from '@angular/router';
import { autenticado, invitado } from './nucleo/guardias';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [invitado],
    loadComponent: () => import('./paginas/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [autenticado],
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    children: [
      {
        path: 'clientes',
        loadComponent: () => import('./paginas/clientes/clientes').then((m) => m.Clientes),
      },
      // Va antes que /clientes/:id, si no "nuevo" se toma como un id.
      {
        path: 'clientes/nuevo',
        loadComponent: () =>
          import('./paginas/cliente/formulario-cliente').then((m) => m.FormularioCliente),
      },
      {
        path: 'clientes/:id/editar',
        loadComponent: () =>
          import('./paginas/cliente/formulario-cliente').then((m) => m.FormularioCliente),
      },
      {
        path: 'clientes/:id',
        loadComponent: () => import('./paginas/cliente/cliente').then((m) => m.ClienteFicha),
      },
      { path: '', pathMatch: 'full', redirectTo: 'clientes' },
    ],
  },
  { path: '**', redirectTo: '' },
];
