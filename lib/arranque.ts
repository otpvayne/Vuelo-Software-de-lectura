/**
 * Señal de "la biblioteca ya cargó" para la animación de bienvenida: la animación no se retira
 * hasta que haya algo que mostrar detrás (nunca una pantalla en blanco).
 */
let lista = false;
const listeners = new Set<() => void>();

export const bibliotecaLista = () => lista;

export function marcarBibliotecaLista() {
  if (lista) return;
  lista = true;
  listeners.forEach((cb) => cb());
}

export function alBibliotecaLista(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
