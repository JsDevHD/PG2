/**
 * Almacenamiento del JWT (sección 7.1). Vive fuera de React para que el interceptor de Axios
 * pueda leerlo sin depender del árbol de componentes; AuthContext lo replica en memoria.
 *
 * Tradeoff aceptado en la especificación: localStorage es legible por JS (riesgo XSS). Trabajo
 * futuro: cookie httpOnly + SameSite=Strict emitida por Auth Service.
 */

export const TOKEN_KEY = "auth_token";

type Listener = () => void;
const expiredListeners = new Set<Listener>();

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Almacenamiento bloqueado (modo privado estricto): la sesión dura lo que la pestaña.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento disponible no hay nada que limpiar.
  }
}

/** El interceptor avisa aquí cuando el backend responde 401; AuthContext se suscribe. */
export function onSessionExpired(listener: Listener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export function notifySessionExpired(): void {
  for (const listener of expiredListeners) listener();
}
