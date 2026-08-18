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
        path: 'clientes/:id/pedido',
        loadComponent: () => import('./paginas/pedido/nuevo-pedido').then((m) => m.NuevoPedido),
      },
      {
        path: 'clientes/:id',
        loadComponent: () => import('./paginas/cliente/cliente').then((m) => m.ClienteFicha),
      },
      {
        path: 'riesgo',
        loadComponent: () => import('./paginas/riesgo/riesgo').then((m) => m.Riesgo),
      },
      {
        path: 'pedidos',
        loadComponent: () => import('./paginas/tablero/tablero').then((m) => m.Tablero),
      },
      {
        path: 'productos',
        loadComponent: () => import('./paginas/productos/productos').then((m) => m.Productos),
      },
      {
        path: 'panel',
        loadComponent: () => import('./paginas/panel/panel').then((m) => m.Panel),
      },
      { path: '', pathMatch: 'full', redirectTo: 'clientes' },
    ],
  },
  { path: '**', redirectTo: '' },
];
