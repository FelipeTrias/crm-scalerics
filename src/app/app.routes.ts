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
      { path: '', pathMatch: 'full', redirectTo: 'clientes' },
    ],
  },
  { path: '**', redirectTo: '' },
];
