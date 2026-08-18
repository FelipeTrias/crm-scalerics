import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Sesion } from './sesion';

/**
 * Exige sesion iniciada.
 *
 * En el servidor devuelve true sin consultar nada. El SSR no tiene la cookie
 * del navegador, asi que preguntar ahi daria siempre "no hay sesion" y todos
 * terminarian en el login. El servidor entrega el armazon y el navegador,
 * que si tiene la cookie, decide.
 */
export const autenticado: CanActivateFn = async () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const sesion = inject(Sesion);
  const router = inject(Router);

  return (await sesion.asegurar()) || router.createUrlTree(['/login']);
};

/** Al reves: si ya hay sesion, el login redirige a la cartera. */
export const invitado: CanActivateFn = async () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return true;

  const sesion = inject(Sesion);
  const router = inject(Router);

  return (await sesion.asegurar()) ? router.createUrlTree(['/clientes']) : true;
};
