import { Route } from '@angular/router';
import { ModuleInProgressPage } from './module-in-progress-page';

/** Crea una ruta que muestra la pantalla temporal de un módulo aún no construido. */
export function createModuleInProgressRoute(
  routePath: string,
  moduleName: string,
  moduleDescription: string,
  plannedSprint: number,
): Route {
  return {
    path: routePath,
    component: ModuleInProgressPage,
    title: `${moduleName} | Farmasalud`,
    data: { moduleName, moduleDescription, plannedSprint },
  };
}
