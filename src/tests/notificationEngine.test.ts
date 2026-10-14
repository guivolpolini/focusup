import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNotificationSupported,
  getNotificationPermissionStatus,
  requestNotificationPermission,
  sendLocalNotification,
} from '../lib/notificationEngine';

describe('notificationEngine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifica detecção de suporte a notificações no ambiente', () => {
    expect(typeof isNotificationSupported()).toBe('boolean');
    expect(typeof getNotificationPermissionStatus()).toBe('string');
  });

  it('retorna true quando permissão já está concedida', async () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = globalThis;
    (globalThis as any).Notification = {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    };

    const granted = await requestNotificationPermission();
    expect(granted).toBe(true);

    (globalThis as any).window = originalWindow;
  });

  it('não quebra ao chamar sendLocalNotification sem suporte ativo', async () => {
    await expect(sendLocalNotification('Teste FocusUp', { body: 'Mensagem de teste' })).resolves.not.toThrow();
  });
});
