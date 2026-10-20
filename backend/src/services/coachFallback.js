// Réponses du coach quand l'IA n'est pas disponible (pas de clé, quota atteint, pas d'Internet).
// Reconnaît quelques mots-clés en français, en arabe et en derja.

const TOPICS = [
  {
    keys: ['programme', 'program', 'برنامج', 'barnemej', 'plan'],
    fr: "Votre programme se trouve dans l'onglet « Programme ». Pour en créer un nouveau, mettez à jour votre profil (objectif, niveau, jours) puis appuyez sur « Générer mon programme ».",
    ar: 'برنامجك موجود في قسم «البرنامج». لإنشاء برنامج جديد، حدّث ملفك الشخصي (الهدف، المستوى، الأيام) ثم اضغط على «إنشاء برنامجي».',
  },
  {
    keys: ['machine', 'occup', 'remplac', 'panne', 'جهاز', 'مشغول', 'عطل', 'makina', 'mechghoul', '3atla'],
    fr: "Pendant la séance, appuyez sur « Occupée », « Absente » ou « En panne » sous l'exercice : je vous propose 3 exercices qui travaillent le même muscle avec le matériel disponible.",
    ar: 'أثناء الحصة، اضغط على «مشغولة» أو «غير موجودة» أو «معطّلة» تحت التمرين: سأقترح عليك 3 تمارين تعمل على نفس العضلة بالمعدات المتوفرة.',
  },
  {
    keys: ['douleur', 'mal', 'bless', 'ألم', 'وجع', 'إصابة', 'yoja3', 'wja3', 'mridh'],
    fr: "Si vous avez mal, arrêtez l'exercice. Indiquez la zone dans votre profil (blessures) : je ne proposerai plus d'exercices qui la sollicitent. Une douleur qui dure doit être vue par un médecin.",
    ar: 'إذا شعرت بألم، أوقف التمرين. أضف المنطقة المصابة في ملفك الشخصي ولن أقترح تمارين تضغط عليها. إذا استمر الألم، استشر طبيباً.',
  },
  {
    keys: ['manger', 'nutrition', 'protéine', 'proteine', 'repas', 'أكل', 'بروتين', 'ماكلة', 'makla', 'regime'],
    fr: "Visez environ 1,6 g de protéines par kg de poids par jour, réparties sur 3 ou 4 repas : œufs, poulet, thon, lentilles, pois chiches, yaourt. Buvez au moins 1,5 L d'eau par jour.",
    ar: 'استهدف حوالي 1.6 غرام من البروتين لكل كيلوغرام من وزنك يومياً، موزعة على 3 أو 4 وجبات: بيض، دجاج، تونة، عدس، حمص، ياغورت. واشرب على الأقل لتراً ونصف من الماء يومياً.',
  },
  {
    keys: ['motivation', 'fatigu', 'flemme', 'تعب', 'كسل', 'ta3ban', 'mkasel'],
    fr: "Une séance courte vaut mieux qu'aucune séance. Essayez le mode « 30 minutes » : on garde les exercices les plus importants. Votre série de jours compte !",
    ar: 'حصة قصيرة أفضل من لا شيء. جرّب وضع «30 دقيقة»: نحتفظ بأهم التمارين فقط. سلسلة أيامك مهمة!',
  },
];

const DEFAULT = {
  fr: "Je suis votre coach FitCoach. Je peux vous aider pour votre programme, remplacer une machine, la récupération ou l'alimentation. (Mode simple : l'IA n'est pas activée sur ce serveur.)",
  ar: 'أنا مدربك في FitCoach. يمكنني مساعدتك في برنامجك، أو تعويض جهاز، أو الاسترجاع، أو التغذية. (الوضع البسيط: الذكاء الاصطناعي غير مفعّل على هذا الخادم.)',
};

function fallbackReply(text, language = 'fr') {
  const lower = (text || '').toLowerCase();
  const topic = TOPICS.find((t) => t.keys.some((k) => lower.includes(k)));
  const source = topic || DEFAULT;
  return language === 'ar' ? source.ar : source.fr;
}

module.exports = { fallbackReply };
