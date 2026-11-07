// Réponses du coach quand l'IA n'est pas disponible (pas de clé, quota atteint, pas d'Internet).
// Le sujet est reconnu par coachRules.detectTopic (français, arabe, derja, anglais).
const { detectTopic } = require('./coachRules');

const REPLIES = {
  PROGRAMME: {
    fr: "Ton programme est dans l'onglet « Entraînement ». Si tes jours ou ton objectif changent, mets à jour ton profil : le programme et tes calories sont recalculés.",
    ar: 'البرنامج متاعك موجود في «التمارين». كان تبدّلت الأيام ولا الهدف، بدّل الملف الشخصي متاعك ونعاودو نحسبو البرنامج والكالوريات.',
    en: 'Your program is in the "Training" tab. If your days or goal change, update your profile: your program and calories are recalculated.',
  },
  REMPLACER: {
    fr: "Pendant la séance, appuie sur « Occupée », « Absente » ou « En panne » sous l'exercice : je te propose 3 exercices qui travaillent le même muscle avec le matériel disponible. Tu peux aussi choisir « J'attends ».",
    ar: 'في وسط الحصة، انزل على «مشغولة» ولا «مش موجودة» ولا «معطّلة» تحت التمرين: نقترحلك 3 تمارين يخدمو نفس العضلة بالمعدات المتوفرة.',
    en: 'During your session, tap "Busy", "Missing" or "Broken" under the exercise: I suggest 3 exercises for the same muscle with the equipment available.',
  },
  DOULEUR: {
    fr: "Si tu as mal, arrête l'exercice. Ajoute la zone dans ton profil (douleurs) : je ne te proposerai plus d'exercices qui la chargent. Une douleur qui dure doit être vue par un médecin ou un kiné. Ce n'est pas un avis médical.",
    ar: 'كان عندك وجيعة، وقّف التمرين. زيد البلاصة في الملف الشخصي متاعك وما عادش نقترحلك تمارين تضغط عليها. كان الوجيعة طوّلت، شوف طبيب ولا كينيه. هذا موش رأي طبي.',
    en: "If it hurts, stop the exercise. Add the area to your profile (pain): I won't suggest exercises that load it. Pain that lasts should be seen by a doctor or physio. This is not medical advice.",
  },
  NUTRITION: {
    fr: "Vise environ 1,6 g de protéines par kg de poids par jour, réparties sur 3 ou 4 repas : œufs, poulet, thon, lentilles, pois chiches, yaourt. Ton objectif d'eau est dans l'onglet « Repas ».",
    ar: 'حاول تاخو حوالي 1.6 غرام من البروتين على كل كيلو من الوزن متاعك في النهار، على 3 ولا 4 ماكلات: عظم، دجاج، تن، عدس، حمص، ياغرت. هدف الماء متاعك في «الوجبات».',
    en: 'Aim for about 1.6 g of protein per kg of body weight per day, over 3 or 4 meals: eggs, chicken, tuna, lentils, chickpeas, yogurt. Your water target is in the "Meals" tab.',
  },
  MOTIVATION: {
    fr: "Une séance courte vaut mieux qu'aucune séance. Essaie le mode « Rapide 30 min » : on garde les 3 exercices les plus importants. Ta série compte, kammel !",
    ar: 'حصة قصيرة خير من والو. جرّب «سريع 30 دقيقة»: نخليو أهم 3 تمارين برك. السلسلة متاعك مهمة، كمّل!',
    en: 'A short session beats no session. Try "Quick 30 min": we keep the 3 most important exercises. Your streak counts, keep going!',
  },
  AUTRE: {
    fr: "Je suis le coach Kammel. Je peux t'aider pour ton programme, remplacer une machine, la récupération ou les repas. (Mode simple : l'IA n'est pas activée sur ce serveur.)",
    ar: 'أنا الكوتش متاع كمّل. نجم نعاونك في البرنامج، تبديل ماكينة، الراحة ولا الماكلة. (الوضع البسيط: الذكاء الاصطناعي موش مفعّل.)',
    en: "I'm the Kammel coach. I can help with your program, replacing a machine, recovery or meals. (Simple mode: AI is not enabled on this server.)",
  },
};

function fallbackReply(text, language = 'fr', topic = detectTopic(text)) {
  const reply = REPLIES[topic] || REPLIES.AUTRE;
  return reply[['fr', 'ar', 'en'].includes(language) ? language : 'fr'];
}

module.exports = { fallbackReply, REPLIES };
