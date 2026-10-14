/**
 * Motor de notificações locais e vibração para PWA e navegadores mobile.
 * 100% no cliente, sem necessidade de servidores externos.
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function sendLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  // Tentar disparar vibração háptica no celular
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // Ignorar se não suportado
    }
  }

  // Se houver Service Worker ativo (PWA instalada no celular)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && 'showNotification' in registration) {
        await (registration as any).showNotification(title, {
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          vibrate: [200, 100, 200],
          ...options,
        });
        return;
      }
    } catch (e) {
      console.warn('Falha ao disparar notificação via ServiceWorker, usando fallback nativo:', e);
    }
  }

  // Fallback padrão do navegador
  try {
    new Notification(title, {
      icon: '/favicon.svg',
      ...options,
    });
  } catch (e) {
    console.warn('Falha na notificação nativa:', e);
  }
}
