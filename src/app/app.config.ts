import { registerLocaleData } from '@angular/common';
import localeSpanishPeru from '@angular/common/locales/es-PE';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';

/** Fechas, números y moneda en español de Perú (lunes, 1.234,50, etc.). */
registerLocaleData(localeSpanishPeru);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'es-PE' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Cambio de página como un viaje a lo largo de la ruta (sin efecto con movimiento reducido).
      withViewTransitions({
        skipInitialTransition: true,
        // Los paneles internos son de trabajo: navegación instantánea, sin viaje.
        onViewTransitionCreated: ({ transition, to }) => {
          const destinationPath = to.pathFromRoot
            .map((route) => route.url.map((segment) => segment.path).join('/'))
            .join('/');
          if (/^\/?(admin|trabajador)/.test(destinationPath)) {
            transition.skipTransition();
          }
        },
      }),
    ),
  ],
};
