// Notifications dans l'app : textes automatiques dans la langue du membre et création en masse.
const { Notification } = require('../models');

const LANGS = ['fr', 'ar', 'en'];
const fill = (s, params) => String(s).replace(/\{(\w+)\}/g, (_, k) => (params[k] == null ? '' : String(params[k])));

// Routes internes de l'app (jamais d'URL externe)
const LINKS = {
  WELCOME: '/app',
  EXPIRY: '/app/account/subscription',
  INACTIVE: '/app/training',
  CALM: '/app/live',
  REPAIRED: '/app/account/reports',
  MESSAGE: '/app/notifications',
  SYSTEM: '/app/notifications',
};

const TEXTS = {
  WELCOME: {
    fr: ['Bienvenue chez {gym} !', 'Ton compte Kammel est prêt. Choisis ton mot de passe et réponds à quelques questions pour recevoir ton programme.'],
    ar: ['مرحبا بيك في {gym}!', 'حسابك في كمّل واجد. اختار كلمة السر وجاوب على شوية أسئلة باش تاخو البرنامج متاعك.'],
    en: ['Welcome to {gym}!', 'Your Kammel account is ready. Choose your password and answer a few questions to get your program.'],
  },
  EXPIRY: {
    fr: ['Ton abonnement expire dans {days} jours', 'Ton abonnement {plan} se termine le {date}. Passe à l’accueil pour le renouveler.'],
    ar: ['اشتراكك يوفى بعد {days} أيام', 'اشتراك {plan} يوفى نهار {date}. فوت على الاستقبال باش تجدّدو.'],
    en: ['Your membership expires in {days} days', 'Your {plan} membership ends on {date}. Renew it at the front desk.'],
  },
  EXPIRY_TODAY: {
    fr: ['Ton abonnement expire aujourd’hui', 'Ton abonnement {plan} se termine aujourd’hui. Passe à l’accueil pour le renouveler.'],
    ar: ['اشتراكك يوفى اليوم', 'اشتراك {plan} يوفى اليوم. فوت على الاستقبال باش تجدّدو.'],
    en: ['Your membership expires today', 'Your {plan} membership ends today. Renew it at the front desk.'],
  },
  INACTIVE: {
    fr: ['On ne t’a pas vu depuis {days} jours', 'Ta prochaine séance t’attend. Ton programme est gardé, reviens quand tu veux.'],
    ar: ['ما شفناكش من {days} يوم', 'الحصة الجاية تستنّى فيك. البرنامج متاعك محفوظ، ارجع وقتلي تحب.'],
    en: ['We haven’t seen you for {days} days', 'Your next session is waiting. Your program is saved, come back anytime.'],
  },
  CALM: {
    fr: ['La salle est calme', '{count} personnes à {gym} en ce moment. C’est le bon moment !'],
    ar: ['القاعة هادية', '{count} أشخاص في {gym} توّا. وقت مزيان!'],
    en: ['The gym is quiet', '{count} people at {gym} right now. Good time to go!'],
  },
  REPAIRED: {
    fr: ['{machine} réparé', 'Merci pour ton signalement : {machine} fonctionne de nouveau.'],
    ar: ['{machine} تصلّحت', 'يعيشك على التبليغ: {machine} رجعت تخدم.'],
    en: ['{machine} repaired', 'Thanks for your report: {machine} works again.'],
  },
};

/** Titre et texte d'une notification automatique dans une langue */
function textFor(key, language, params = {}) {
  const t = TEXTS[key] || TEXTS.WELCOME;
  const [title, body] = t[LANGS.includes(language) ? language : 'fr'];
  return { title: fill(title, params).slice(0, 120), body: fill(body, params).slice(0, 500) };
}

/**
 * Crée une notification par membre, dans sa langue.
 * @param {object[]} users            membres (id, language)
 * @param {string} kind               WELCOME | EXPIRY | INACTIVE | CALM | REPAIRED | MESSAGE | SYSTEM
 * @param {object|function} params    paramètres du texte, ou fonction (user) => paramètres
 * @param {object} options            { gymId, campaignId, link, textKey, transaction }
 * @returns {Promise<number>} nombre de notifications créées
 */
async function notifyUsers(users, kind, params = {}, options = {}) {
  if (!users.length) return 0;
  const rows = users.map((u) => {
    const p = typeof params === 'function' ? params(u) : params;
    const key = typeof options.textKey === 'function' ? options.textKey(u, p) : options.textKey || kind;
    return {
      userId: u.id,
      gymId: options.gymId || u.gymId || null,
      campaignId: options.campaignId || null,
      kind,
      link: (typeof options.link === 'function' ? options.link(u, p) : options.link) || LINKS[kind] || null,
      ...textFor(key, u.language, p),
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    await Notification.bulkCreate(rows.slice(i, i + 500), { transaction: options.transaction });
  }
  return rows.length;
}

/** Message rédigé par l'équipe : arabe si le membre lit l'arabe et que la version arabe existe, sinon français */
function campaignTextFor(campaign, language) {
  if (language === 'ar' && campaign.titleAr && campaign.bodyAr) return { title: campaign.titleAr, body: campaign.bodyAr };
  return { title: campaign.titleFr, body: campaign.bodyFr };
}

module.exports = { textFor, notifyUsers, campaignTextFor, LINKS, TEXTS };
