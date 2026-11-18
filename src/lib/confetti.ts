import type { Options } from 'canvas-confetti';

/**
 * Dispara confetes sob demanda via dynamic import, respeitando `prefers-reduced-motion`.
 * Evita carregar `canvas-confetti` no bundle inicial.
 */
export async function triggerConfetti(options?: Options): Promise<void> {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  try {
    const mod = await import('canvas-confetti');
    const fire = mod.default;
    fire(options);
  } catch (err) {
    console.warn('Falha ao disparar animação de confete:', err);
  }
}
