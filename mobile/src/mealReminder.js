import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Rappel du soir : si l'objectif du jour n'est pas atteint, une notification arrive à 20 h
export const REMINDER_HOUR = 20;
const ID = 'fitcoach-meal-reminder';
const BELOW = 0.8; // en dessous de 80 % de l'objectif → « mangez encore »

// expo-notifications n'est pas disponible dans Expo Go (module natif absent → plantage au démarrage) :
// on ne le charge que dans une vraie application ; dans Expo Go, seule l'alerte dans l'application reste.
let notificationsModule;
function getNotifications() {
  if (notificationsModule !== undefined) return notificationsModule;
  notificationsModule = null;
  if (Constants.executionEnvironment === 'storeClient') return null; // Expo Go
  try {
    notificationsModule = require('expo-notifications');
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch {
    notificationsModule = null;
  }
  return notificationsModule;
}

/** Ce qui manque encore : calories et/ou protéines sous 80 % de l'objectif */
export function missing(target, totals) {
  if (!target) return [];
  return ['calories', 'protein'].filter((k) => totals[k] < target[k] * BELOW);
}

/**
 * Replanifie le rappel du jour après chaque changement (repas ajouté ou supprimé).
 * @param {{ target, totals, remaining }} day  bilan renvoyé par /nutrition/day
 * @param {(key: string, vars?: object) => string} t  traduction
 */
export async function updateMealReminder(day, t) {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (!missing(day.target, day.totals).length) return;
    const at = new Date();
    at.setHours(REMINDER_HOUR, 0, 0, 0);
    if (at <= new Date()) return; // trop tard : l'alerte est affichée dans l'application

    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('meals', { name: 'Repas', importance: Notifications.AndroidImportance.HIGH });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: {
        title: t('meals.notifTitle'),
        body: t('meals.notifBody', { kcal: day.remaining.calories, p: day.remaining.protein }),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'meals' },
    });
  } catch {
    // notifications indisponibles (ex. Expo Go limité) : l'alerte reste visible dans l'application
  }
}
