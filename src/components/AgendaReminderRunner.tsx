import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  calculateReminderTimestamp,
  formatAgendaTime,
  getAgendaCategoryMeta,
  getEventOccurrencesForRange,
} from '../lib/agendaEngine';
import {
  getNotificationPermissionStatus,
  sendLocalNotification,
} from '../lib/notificationEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';
import type { AgendaEvent } from '../types';

const EMPTY_EVENTS: AgendaEvent[] = [];

/**
 * Executa o monitor de lembretes da Agenda no nível raiz do app,
 * garantindo notificações em qualquer aba ativa e sem re-renderizar App.tsx.
 */
export function AgendaReminderRunner() {
  const events = useLiveQuery(() => db.agendaEvents.toArray()) ?? EMPTY_EVENTS;
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (events.length === 0) return;

    const checkReminders = async () => {
      if (getNotificationPermissionStatus() !== 'granted') return;
      const nowMs = Date.now();
      const currentTodayStr = formatDateToLocalYYYYMMDD(new Date(nowMs));
      const todayOccs = getEventOccurrencesForRange(events, currentTodayStr, currentTodayStr);

      for (const occ of todayOccs) {
        if (occ.completed || occ.reminder === 'none') continue;
        const reminderTs = calculateReminderTimestamp(occ.date, occ.startTime, occ.reminder);
        if (!reminderTs) continue;

        const notifKey = `${occ.id}_${reminderTs}`;
        if (notifiedIdsRef.current.has(notifKey)) continue;

        if (nowMs >= reminderTs && nowMs <= reminderTs + 120000) {
          notifiedIdsRef.current.add(notifKey);
          const timeText = formatAgendaTime(occ.startTime, occ.endTime);
          await sendLocalNotification(`Lembrete FocusUp: ${occ.title}`, {
            body: `${timeText} • ${getAgendaCategoryMeta(occ.category).label}${
              occ.description ? `\n${occ.description}` : ''
            }`,
          });
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [events]);

  return null;
}
