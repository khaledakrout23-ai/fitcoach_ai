import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { dictionaries } from './locales';

// Textes propres à l'application mobile
const extra = {
  fr: { 'mobile.serverHint': 'Le téléphone et le PC doivent être sur le même Wi-Fi.', 'mobile.back': 'Retour', 'mobile.openYoutube': 'Ouvrir YouTube', 'mobile.noVideo': 'Aucune vidéo trouvée pour cet exercice.', 'mobile.closeVideo': 'Fermer','err.MOBILE_ONLY': 'L’application mobile est réservée aux sportifs. Gérants et administrateurs : utilisez le site web.' },
  ar: { 'mobile.serverHint': 'يجب أن يكون الهاتف والحاسوب على نفس شبكة الواي فاي.', 'mobile.back': 'رجوع', 'mobile.openYoutube': 'فتح يوتيوب', 'mobile.noVideo': 'لا يوجد فيديو لهذا التمرين.', 'mobile.closeVideo': 'إغلاق','err.MOBILE_ONLY': 'تطبيق الهاتف مخصّص للرياضيين. المسيّرون والمدير: استعملوا الموقع.' },
};

// Section repas
const mealsText = {
  fr: {
    'nav.meals': 'Repas',
    'meals.sub': 'Photographiez vos repas : l’IA estime calories, protéines et glucides.',
    'meals.targetTitle': 'Mon objectif journalier',
    'meals.targetExplain': 'L’IA calcule ce que vous devez manger chaque jour (calories, protéines, glucides, lipides) selon votre profil et votre objectif.',
    'meals.compute': 'Calculer mon objectif avec l’IA',
    'meals.recompute': 'Recalculer mon objectif',
    'meals.computing': 'Calcul en cours…',
    'meals.today': 'Aujourd’hui',
    'meals.source.IA': 'Calculé par l’IA',
    'meals.source.REGLES': 'Calculé par formule',
    'meals.calories': 'Calories',
    'meals.protein': 'Protéines',
    'meals.carbs': 'Glucides',
    'meals.fat': 'Lipides',
    'meals.alertTitle': '⚠ Objectif du jour non atteint : mangez encore !',
    'meals.leftTitle': 'Reste à manger aujourd’hui',
    'meals.alertBody': 'Il vous manque {kcal} kcal, {p} g de protéines et {c} g de glucides.',
    'meals.reached': '✓ Objectif du jour atteint, bravo !',
    'meals.scanTitle': 'Ajouter un repas',
    'meals.scanHint': 'Prenez votre assiette en photo, bien visible et de près.',
    'meals.scan': 'Photographier mon repas',
    'meals.gallery': 'Galerie',
    'meals.manual': 'Saisir à la main',
    'meals.analyzing': 'L’IA analyse votre repas…',
    'meals.estimated': 'Estimé par l’IA',
    'meals.approx': 'Valeurs approximatives : corrigez-les si besoin avant d’ajouter.',
    'meals.namePlaceholder': 'Nom du repas',
    'meals.add': 'Ajouter ce repas',
    'meals.list': 'Repas du jour ({n})',
    'meals.none': 'Aucun repas enregistré aujourd’hui.',
    'meals.deleteTitle': 'Supprimer ce repas ?',
    'meals.notifTitle': 'FitCoach : objectif repas non atteint',
    'meals.notifBody': 'Il vous manque encore {kcal} kcal et {p} g de protéines aujourd’hui. Pensez à manger !',
    'home.mealsTitle': 'Repas du jour',
    'meals.objectiveTitle': 'Votre objectif du jour',
    'meals.objective': 'Aujourd’hui, vous devez atteindre {kcal} kcal, {p} g de protéines, {c} g de glucides et {f} g de lipides.',
    'meals.kcalLeft': 'Reste {n} kcal',
    'meals.left': 'reste {n} g',
    'meals.done': 'Objectif atteint ✓',
    'meals.profileNeeded': 'Renseignez votre âge, votre poids et votre taille dans le profil : votre objectif du jour (calories, protéines, glucides) sera calculé automatiquement.',
    'meals.addedTitle': '« {name} » ajouté',
    'meals.addedBody': '+{kcal} kcal · +{p} g de protéines · +{c} g de glucides',
    'meals.reachTitle': 'Ce que vous allez atteindre ({goal})',
    'meals.reachWeight': 'En respectant cet objectif : {week} kg par semaine, soit environ {month} kg par mois.',
    'meals.reachStable': 'En respectant cet objectif : poids stable, plus de muscle et plus d’énergie.',
    'meals.maintenance': 'Entretien (poids stable) : {kcal} kcal',
    'meals.proteinPerKg': '{n} g de protéines par kg',
    'meals.statsTitle': 'Statistiques',
    'meals.days': '{n} j',
    'meals.chartLegend': 'Calories par jour. Vert : objectif atteint · Jaune : insuffisant · Pointillés : objectif.',
    'meals.reachedDays': 'Objectif atteint',
    'meals.streak': 'Série',
    'meals.logged': 'Jours suivis',
    'meals.daysUnit': 'jours',
    'meals.averageTitle': 'Moyenne par jour suivi (part de l’objectif)',
    'meals.actualPace': '📈 À votre rythme actuel : {week} kg par semaine.',
    'meals.noStats': 'Pas encore de statistiques : ajoutez vos repas pour suivre vos progrès.',
    'err.CAMERA_DENIED': 'Accès à l’appareil photo refusé. Autorisez-le dans les réglages du téléphone.',
  },
  ar: {
    'nav.meals': 'الوجبات',
    'meals.sub': 'صوّر وجباتك: الذكاء الاصطناعي يقدّر السعرات والبروتين والكربوهيدرات.',
    'meals.targetTitle': 'هدفي اليومي',
    'meals.targetExplain': 'يحسب الذكاء الاصطناعي ما يجب أن تأكله كل يوم (سعرات، بروتين، كربوهيدرات، دهون) حسب ملفك وهدفك.',
    'meals.compute': 'احسب هدفي بالذكاء الاصطناعي',
    'meals.recompute': 'أعد حساب هدفي',
    'meals.computing': 'جارٍ الحساب…',
    'meals.today': 'اليوم',
    'meals.source.IA': 'محسوب بالذكاء الاصطناعي',
    'meals.source.REGLES': 'محسوب بمعادلة',
    'meals.calories': 'السعرات',
    'meals.protein': 'البروتين',
    'meals.carbs': 'الكربوهيدرات',
    'meals.fat': 'الدهون',
    'meals.alertTitle': '⚠ لم تبلغ هدف اليوم: كُل أكثر!',
    'meals.leftTitle': 'ما تبقّى لك اليوم',
    'meals.alertBody': 'ينقصك {kcal} سعرة و{p} غ بروتين و{c} غ كربوهيدرات.',
    'meals.reached': '✓ بلغت هدف اليوم، أحسنت!',
    'meals.scanTitle': 'إضافة وجبة',
    'meals.scanHint': 'صوّر صحنك بوضوح ومن قريب.',
    'meals.scan': 'تصوير وجبتي',
    'meals.gallery': 'المعرض',
    'meals.manual': 'إدخال يدوي',
    'meals.analyzing': 'الذكاء الاصطناعي يحلّل وجبتك…',
    'meals.estimated': 'تقدير الذكاء الاصطناعي',
    'meals.approx': 'قيم تقريبية: صحّحها إن لزم قبل الإضافة.',
    'meals.namePlaceholder': 'اسم الوجبة',
    'meals.add': 'إضافة الوجبة',
    'meals.list': 'وجبات اليوم ({n})',
    'meals.none': 'لا توجد وجبات مسجّلة اليوم.',
    'meals.deleteTitle': 'حذف هذه الوجبة؟',
    'meals.notifTitle': 'FitCoach: لم تبلغ هدف الوجبات',
    'meals.notifBody': 'ينقصك {kcal} سعرة و{p} غ بروتين اليوم. لا تنسَ الأكل!',
    'home.mealsTitle': 'وجبات اليوم',
    'meals.objectiveTitle': 'هدفك اليوم',
    'meals.objective': 'اليوم، يجب أن تصل إلى {kcal} سعرة و{p} غ بروتين و{c} غ كربوهيدرات و{f} غ دهون.',
    'meals.kcalLeft': 'تبقّى {n} سعرة',
    'meals.left': 'تبقّى {n} غ',
    'meals.done': 'تم بلوغ الهدف ✓',
    'meals.profileNeeded': 'أدخل عمرك ووزنك وطولك في الملف الشخصي: سيُحسب هدفك اليومي (سعرات، بروتين، كربوهيدرات) تلقائياً.',
    'meals.addedTitle': 'تمت إضافة «{name}»',
    'meals.addedBody': '+{kcal} سعرة · +{p} غ بروتين · +{c} غ كربوهيدرات',
    'meals.reachTitle': 'ما ستحققه ({goal})',
    'meals.reachWeight': 'باحترام هذا الهدف: {week} كغ في الأسبوع، أي حوالي {month} كغ في الشهر.',
    'meals.reachStable': 'باحترام هذا الهدف: وزن ثابت، عضلات أكثر وطاقة أكبر.',
    'meals.maintenance': 'سعرات الثبات: {kcal} سعرة',
    'meals.proteinPerKg': '{n} غ بروتين لكل كغ',
    'meals.statsTitle': 'الإحصائيات',
    'meals.days': '{n} يوم',
    'meals.chartLegend': 'السعرات في كل يوم. أخضر: الهدف محقق · أصفر: غير كافٍ · الخط المنقط: الهدف.',
    'meals.reachedDays': 'الهدف محقق',
    'meals.streak': 'سلسلة',
    'meals.logged': 'أيام مسجّلة',
    'meals.daysUnit': 'أيام',
    'meals.averageTitle': 'المعدل اليومي (نسبة من الهدف)',
    'meals.actualPace': '📈 بوتيرتك الحالية: {week} كغ في الأسبوع.',
    'meals.noStats': 'لا توجد إحصائيات بعد: أضف وجباتك لمتابعة تقدّمك.',
    'err.CAMERA_DENIED': 'تم رفض الوصول إلى الكاميرا. اسمح بها في إعدادات الهاتف.',
    'err.NOT_FOOD': 'لم يتم التعرّف على وجبة في الصورة. أعد التصوير من قريب.',
    'err.NUTRITION_PROFILE': 'أدخل عمرك ووزنك وطولك في الملف الشخصي.',
    'err.AI_UNAVAILABLE': 'الذكاء الاصطناعي غير متاح حالياً. أعد المحاولة بعد قليل.',
    'err.NO_AI': 'هذه الميزة تتطلب الذكاء الاصطناعي.',
  },
};

// Vérification d'e-mail, mot de passe oublié, changement de mot de passe
const authText = {
  fr: {
    'pw.length': '8 caractères minimum',
    'pw.upper': 'Une majuscule',
    'pw.lower': 'Une minuscule',
    'pw.digit': 'Un chiffre',
    'pw.show': 'Afficher',
    'pw.hide': 'Masquer',
    'pw.changeTitle': 'Changer mon mot de passe',
    'pw.current': 'Mot de passe actuel',
    'pw.new': 'Nouveau mot de passe',
    'pw.confirm': 'Confirmer le mot de passe',
    'pw.save': 'Enregistrer',
    'pw.changed': 'Mot de passe modifié.',
    'verify.title': 'Vérifiez votre e-mail',
    'verify.sent': 'Nous avons envoyé un code à 6 chiffres à',
    'verify.code': 'Code reçu par e-mail',
    'verify.submit': 'Vérifier mon adresse',
    'verify.noMail': 'Pas reçu ?',
    'verify.resend': 'Renvoyer le code',
    'verify.resendIn': 'renvoyer dans {s} s',
    'verify.resent': 'Un nouveau code vous a été envoyé.',
    'verify.back': 'Retour à la connexion',
    'forgot.link': 'Mot de passe oublié ?',
    'forgot.title': 'Mot de passe oublié',
    'forgot.explain': 'Saisissez votre adresse e-mail : vous recevrez un code pour choisir un nouveau mot de passe.',
    'forgot.send': 'Recevoir un code',
    'forgot.newTitle': 'Nouveau mot de passe',
    'forgot.sent': 'Si un compte existe, un code a été envoyé à',
    'forgot.submit': 'Changer mon mot de passe',
    'err.PASSWORD_MISMATCH': 'Les deux mots de passe ne sont pas identiques.',
  },
  ar: {
    'pw.length': '8 أحرف على الأقل',
    'pw.upper': 'حرف كبير',
    'pw.lower': 'حرف صغير',
    'pw.digit': 'رقم',
    'pw.show': 'إظهار',
    'pw.hide': 'إخفاء',
    'pw.changeTitle': 'تغيير كلمة السر',
    'pw.current': 'كلمة السر الحالية',
    'pw.new': 'كلمة السر الجديدة',
    'pw.confirm': 'تأكيد كلمة السر',
    'pw.save': 'حفظ',
    'pw.changed': 'تم تغيير كلمة السر.',
    'verify.title': 'تحقّق من بريدك',
    'verify.sent': 'أرسلنا رمزاً من 6 أرقام إلى',
    'verify.code': 'الرمز المستلم بالبريد',
    'verify.submit': 'تأكيد بريدي',
    'verify.noMail': 'لم يصلك؟',
    'verify.resend': 'أعد إرسال الرمز',
    'verify.resendIn': 'إعادة الإرسال بعد {s} ث',
    'verify.resent': 'تم إرسال رمز جديد.',
    'verify.back': 'العودة إلى تسجيل الدخول',
    'forgot.link': 'نسيت كلمة السر؟',
    'forgot.title': 'نسيت كلمة السر',
    'forgot.explain': 'أدخل بريدك الإلكتروني: ستصلك رسالة برمز لاختيار كلمة سر جديدة.',
    'forgot.send': 'استلام رمز',
    'forgot.newTitle': 'كلمة سر جديدة',
    'forgot.sent': 'إذا كان الحساب موجوداً، أُرسل رمز إلى',
    'forgot.submit': 'تغيير كلمة السر',
    'err.PASSWORD_MISMATCH': 'كلمتا السر غير متطابقتين.',
    'err.WEAK_PASSWORD': 'كلمة السر ضعيفة: 8 أحرف على الأقل، حرف كبير، حرف صغير ورقم.',
    'err.EMAIL_NOT_VERIFIED': 'البريد غير مؤكَّد: أدخل الرمز المستلم بالبريد.',
    'err.CODE_INVALID': 'الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً.',
    'err.TOO_SOON': 'انتظر دقيقة قبل طلب رمز جديد.',
    'err.MAIL_FAILED': 'تعذّر إرسال البريد حالياً. أعد المحاولة لاحقاً.',
    'err.BAD_PASSWORD': 'كلمة السر الحالية غير صحيحة.',
    'err.SAME_PASSWORD': 'يجب أن تختلف كلمة السر الجديدة عن القديمة.',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('fr');
  const [meta, setMeta] = useState({ muscles: {}, patterns: {}, injuryZones: {} });

  useEffect(() => {
    AsyncStorage.getItem('fitcoach_lang').then((l) => l === 'ar' && setLangState('ar'));
    api('/meta').then(setMeta).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const dict = { ...dictionaries[lang], ...extra[lang], ...mealsText[lang], ...authText[lang] };
    const locale = lang === 'ar' ? 'ar-TN' : 'fr-FR';
    const rtl = lang === 'ar';
    const t = (key, vars) => {
      let text = dict[key] ?? dictionaries.fr[key] ?? mealsText.fr[key] ?? authText.fr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
      return text;
    };
    return {
      lang,
      rtl,
      setLang(next) {
        setLangState(next);
        AsyncStorage.setItem('fitcoach_lang', next);
      },
      t,
      name: (obj, field = 'name') => (obj ? obj[`${field}${rtl ? 'Ar' : 'Fr'}`] || obj[`${field}Fr`] : ''),
      list: (obj, field) => (obj ? obj[`${field}${rtl ? 'Ar' : 'Fr'}`] || [] : []),
      muscle: (code) => meta.muscles[code]?.[lang] || code,
      zone: (code) => meta.injuryZones[code]?.[lang] || code,
      meta,
      date: (d) => (d ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''),
      num: (n) => String(Math.round((Number(n) || 0) * 10) / 10),
      error: (err) => (err?.code && dict[`err.${err.code}`]) || err?.message || dict['err.ERROR'],
      // styles pour l'arabe (de droite à gauche)
      text: { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
      row: rtl ? 'row-reverse' : 'row',
    };
  }, [lang, meta]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}
