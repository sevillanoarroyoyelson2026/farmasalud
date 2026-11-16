/** Error que indica que una operación no terminó a tiempo (o que el usuario la abandonó). */
export class OperationTimeoutError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Espera una promesa como máximo `timeoutMilliseconds`. Si no termina, rechaza con
 * OperationTimeoutError: así ninguna pantalla se queda "cargando" para siempre.
 */
export function settleWithTimeout<Result>(
  pendingOperation: Promise<Result>,
  timeoutMilliseconds: number,
  timeoutCode: string,
): Promise<Result> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new OperationTimeoutError(timeoutCode, 'La operación tardó demasiado.')),
      timeoutMilliseconds,
    );
  });
  return Promise.race([pendingOperation, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

/**
 * Detecta que el usuario cerró o abandonó la ventana emergente de Google.
 * Firebase no siempre lo nota (la cabecera COOP le impide vigilar la ventana), así que:
 * cuando esta pestaña recupera el foco y, tras un margen, el login sigue sin terminar,
 * se considera cancelado. Devuelve la promesa que rechaza y una función para dejar de vigilar.
 */
export function watchForAbandonedPopup(graceMilliseconds = 4000): {
  abandonment: Promise<never>;
  stopWatching: () => void;
} {
  let graceHandle: ReturnType<typeof setTimeout> | undefined;
  let rejectAbandonment: (error: Error) => void = () => undefined;
  const abandonment = new Promise<never>((_resolve, reject) => {
    rejectAbandonment = reject;
  });
  // Evita "unhandled rejection" si nadie llega a esperar la promesa.
  abandonment.catch(() => undefined);

  const handleWindowFocus = () => {
    clearTimeout(graceHandle);
    graceHandle = setTimeout(
      () => rejectAbandonment(new OperationTimeoutError('auth/popup-closed-by-user', 'Ventana de Google cerrada.')),
      graceMilliseconds,
    );
  };
  const stopWatching = () => {
    clearTimeout(graceHandle);
    window.removeEventListener('focus', handleWindowFocus);
  };
  window.addEventListener('focus', handleWindowFocus);
  return { abandonment, stopWatching };
}
