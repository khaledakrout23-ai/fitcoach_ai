// Libellés partagés (français / arabe / anglais), envoyés au site par GET /api/meta

const MUSCLES = {
  pectoraux: { fr: 'Pectoraux', ar: 'الصدر', en: 'Chest' },
  dos: { fr: 'Dos', ar: 'الظهر', en: 'Back' },
  epaules: { fr: 'Épaules', ar: 'الأكتاف', en: 'Shoulders' },
  biceps: { fr: 'Biceps', ar: 'الباي', en: 'Biceps' },
  triceps: { fr: 'Triceps', ar: 'التراي', en: 'Triceps' },
  quadriceps: { fr: 'Quadriceps', ar: 'الفخذ الأمامي', en: 'Quadriceps' },
  ischios: { fr: 'Ischio-jambiers', ar: 'الفخذ الخلفي', en: 'Hamstrings' },
  fessiers: { fr: 'Fessiers', ar: 'الأرداف', en: 'Glutes' },
  mollets: { fr: 'Mollets', ar: 'السمانة', en: 'Calves' },
  abdos: { fr: 'Abdominaux', ar: 'البطن', en: 'Abs' },
};

const PATTERNS = {
  poussee_horizontale: { fr: 'Poussée horizontale', ar: 'دفع أفقي', en: 'Horizontal push' },
  poussee_verticale: { fr: 'Poussée verticale', ar: 'دفع عمودي', en: 'Vertical push' },
  tirage_horizontal: { fr: 'Tirage horizontal', ar: 'سحب أفقي', en: 'Horizontal pull' },
  tirage_vertical: { fr: 'Tirage vertical', ar: 'سحب عمودي', en: 'Vertical pull' },
  squat: { fr: 'Squat', ar: 'قرفصاء', en: 'Squat' },
  charniere: { fr: 'Charnière de hanche', ar: 'ثني الورك', en: 'Hip hinge' },
  fente: { fr: 'Fente', ar: 'طعن', en: 'Lunge' },
  isolation: { fr: 'Isolation', ar: 'عزل', en: 'Isolation' },
  gainage: { fr: 'Gainage', ar: 'ثبات', en: 'Core stability' },
};

// Zones de douleur (onboarding, profil, exercices « à éviter si douleur »)
const INJURY_ZONES = {
  epaule: { fr: 'Épaule', ar: 'الكتف', en: 'Shoulder' },
  genou: { fr: 'Genou', ar: 'الركبة', en: 'Knee' },
  dos: { fr: 'Bas du dos', ar: 'أسفل الظهر', en: 'Lower back' },
  poignet: { fr: 'Poignet', ar: 'المعصم', en: 'Wrist' },
  coude: { fr: 'Coude', ar: 'المرفق', en: 'Elbow' },
  cheville: { fr: 'Cheville', ar: 'الكاحل', en: 'Ankle' },
  cou: { fr: 'Cou', ar: 'الرقبة', en: 'Neck' },
  haut_dos: { fr: 'Haut du dos', ar: 'أعلى الظهر', en: 'Upper back' },
  hanche: { fr: 'Hanche', ar: 'الورك', en: 'Hip' },
};

// Problèmes proposés à l'écran « Signaler une panne »
const ISSUE_TYPES = {
  NE_MARCHE_PAS: { fr: 'Ne marche pas', ar: 'ما تخدمش', en: 'Not working' },
  CABLE: { fr: 'Câble ou poulie', ar: 'الكابل ولا البكرة', en: 'Cable or pulley' },
  REGLAGE: { fr: 'Réglage bloqué', ar: 'الضبط مسكّر', en: 'Adjustment stuck' },
  PIECE_CASSEE: { fr: 'Pièce cassée', ar: 'قطعة مكسّرة', en: 'Broken part' },
  BRUIT: { fr: 'Bruit', ar: 'تعمل حس', en: 'Noise' },
  ECRAN: { fr: 'Écran', ar: 'الشاشة', en: 'Screen' },
  AUTRE: { fr: 'Autre', ar: 'حاجة أخرى', en: 'Other' },
};

const REPORT_STATUSES = {
  NOUVEAU: { fr: 'Nouveau', ar: 'جديد', en: 'New' },
  VU: { fr: 'Vu', ar: 'تشاف', en: 'Seen' },
  REPARATION: { fr: 'En réparation', ar: 'في التصليح', en: 'Being repaired' },
  REPAREE: { fr: 'Réparée', ar: 'تصلّحت', en: 'Repaired' },
  REJETE: { fr: 'Rejeté', ar: 'مرفوض', en: 'Rejected' },
};

const MACHINE_STATUSES = {
  OK: { fr: 'En service', ar: 'تخدم', en: 'In service' },
  SIGNALEE: { fr: 'Signalée', ar: 'مبلّغ عليها', en: 'Reported' },
  REPARATION: { fr: 'En réparation', ar: 'في التصليح', en: 'Being repaired' },
};

const GOALS = {
  PERTE_POIDS: { fr: 'Perdre du poids', ar: 'نقص في الوزن', en: 'Lose weight' },
  PRISE_MASSE: { fr: 'Prendre du muscle', ar: 'نزيد عضل', en: 'Build muscle' },
  FORME: { fr: 'Rester en forme', ar: 'نبقى في الفورمة', en: 'Stay fit' },
  FORCE: { fr: 'Améliorer ma performance', ar: 'نحسّن الأداء متاعي', en: 'Improve performance' },
};

const LEVELS = {
  DEBUTANT: { fr: 'Débutant', ar: 'مبتدئ', en: 'Beginner' },
  INTERMEDIAIRE: { fr: 'Intermédiaire', ar: 'متوسط', en: 'Intermediate' },
  AVANCE: { fr: 'Avancé', ar: 'متقدّم', en: 'Advanced' },
};

const ACTIVITIES = {
  SEDENTAIRE: { fr: 'Surtout assis', ar: 'أغلب الوقت قاعد', en: 'Mostly sitting' },
  LEGER: { fr: 'Légèrement actif', ar: 'نشيط شوية', en: 'Lightly active' },
  ACTIF: { fr: 'Actif', ar: 'نشيط', en: 'Active' },
  TRES_ACTIF: { fr: 'Très actif', ar: 'نشيط برشا', en: 'Very active' },
};

const DIET_STYLES = {
  EQUILIBRE: { fr: 'Équilibré', ar: 'متوازن', en: 'Balanced' },
  PROTEINES: { fr: 'Riche en protéines', ar: 'غني بالبروتين', en: 'High protein' },
  VEGETARIEN: { fr: 'Végétarien', ar: 'نباتي', en: 'Vegetarian' },
  LOW_CARB: { fr: 'Faible en glucides', ar: 'قليل النشويات', en: 'Low carb' },
};

const SEXES = {
  H: { fr: 'Homme', ar: 'راجل', en: 'Male' },
  F: { fr: 'Femme', ar: 'مرا', en: 'Female' },
  NA: { fr: 'Non précisé', ar: 'ما نحبش نقول', en: 'Not specified' },
};

const MEAL_TYPES = {
  PETIT_DEJ: { fr: 'Petit-déj', ar: 'فطور الصباح', en: 'Breakfast' },
  DEJEUNER: { fr: 'Déjeuner', ar: 'الغداء', en: 'Lunch' },
  DINER: { fr: 'Dîner', ar: 'العشاء', en: 'Dinner' },
  COLLATION: { fr: 'Collations', ar: 'لمجة', en: 'Snacks' },
};

// Boissons : toutes comptent pour l'hydratation ; les boissons sucrées ajoutent des calories (kcal par ml)
const DRINKS = {
  EAU: { fr: 'Eau', ar: 'ماء', en: 'Water', kcalPerMl: 0 },
  THE: { fr: 'Thé', ar: 'تاي', en: 'Tea', kcalPerMl: 0 },
  CAFE: { fr: 'Café', ar: 'قهوة', en: 'Coffee', kcalPerMl: 0 },
  JUS: { fr: 'Jus', ar: 'عصير', en: 'Juice', kcalPerMl: 0.45 },
  SHAKE: { fr: 'Shake protéiné', ar: 'شيك بروتين', en: 'Protein shake', kcalPerMl: 0.6 },
};

const PAYMENT_METHOD_LABELS = {
  ESPECES: { fr: 'Espèces', ar: 'كاش', en: 'Cash' },
  CARTE: { fr: 'Carte bancaire', ar: 'بطاقة بنكية', en: 'Card' },
  D17: { fr: 'D17', ar: 'D17', en: 'D17' },
  FLOUCI: { fr: 'Flouci', ar: 'Flouci', en: 'Flouci' },
  VIREMENT: { fr: 'Virement', ar: 'تحويل', en: 'Bank transfer' },
};

const PLAN_UNITS = {
  DAY: { fr: 'jour', ar: 'يوم', en: 'day' },
  MONTH: { fr: 'mois', ar: 'شهر', en: 'month' },
};

const SUBSCRIPTION_STATUSES = {
  ACTIF: { fr: 'Actif', ar: 'ساري', en: 'Active' },
  EXPIRE_BIENTOT: { fr: 'Expire bientôt', ar: 'قريب يوفى', en: 'Expiring soon' },
  GRACE: { fr: 'Délai de grâce', ar: 'مهلة', en: 'Grace period' },
  EXPIRE: { fr: 'Expiré', ar: 'وفى', en: 'Expired' },
  GELE: { fr: 'Gelé', ar: 'مجمّد', en: 'Frozen' },
  AUCUN: { fr: 'Aucun abonnement', ar: 'ما عندوش اشتراك', en: 'No subscription' },
};

const ROLE_LABELS = {
  SPORTIF: { fr: 'Membre', ar: 'منخرط', en: 'Member' },
  GERANT: { fr: 'Gérant', ar: 'مسيّر', en: 'Manager' },
  ACCUEIL: { fr: 'Accueil', ar: 'استقبال', en: 'Reception' },
  TECHNICIEN: { fr: 'Technicien', ar: 'تقني', en: 'Technician' },
  COACH: { fr: 'Coach', ar: 'كوتش', en: 'Coach' },
  ADMIN: { fr: 'Administrateur', ar: 'مشرف', en: 'Administrator' },
};

// 0 = lundi … 6 = dimanche (même convention que User.trainingDays)
const WEEKDAYS = [
  { fr: 'Lundi', ar: 'الإثنين', en: 'Monday' },
  { fr: 'Mardi', ar: 'الثلاثاء', en: 'Tuesday' },
  { fr: 'Mercredi', ar: 'الأربعاء', en: 'Wednesday' },
  { fr: 'Jeudi', ar: 'الخميس', en: 'Thursday' },
  { fr: 'Vendredi', ar: 'الجمعة', en: 'Friday' },
  { fr: 'Samedi', ar: 'السبت', en: 'Saturday' },
  { fr: 'Dimanche', ar: 'الأحد', en: 'Sunday' },
];

// Sujets détectés dans les questions au coach (statistiques anonymes)
const COACH_TOPICS = {
  REMPLACER: { fr: 'Remplacer un exercice', ar: 'تبديل تمرين', en: 'Replace an exercise' },
  NUTRITION: { fr: 'Nutrition et repas', ar: 'الماكلة', en: 'Nutrition and meals' },
  DOULEUR: { fr: 'Douleurs', ar: 'الوجيعة', en: 'Pain' },
  PROGRAMME: { fr: 'Programme', ar: 'البرنامج', en: 'Program' },
  MOTIVATION: { fr: 'Motivation', ar: 'الحماس', en: 'Motivation' },
  AUTRE: { fr: 'Autre', ar: 'حاجة أخرى', en: 'Other' },
};

const LEVEL_VALUE = { DEBUTANT: 1, INTERMEDIAIRE: 2, AVANCE: 3 };

module.exports = {
  MUSCLES,
  PATTERNS,
  INJURY_ZONES,
  ISSUE_TYPES,
  REPORT_STATUSES,
  MACHINE_STATUSES,
  GOALS,
  LEVELS,
  ACTIVITIES,
  DIET_STYLES,
  SEXES,
  MEAL_TYPES,
  DRINKS,
  PAYMENT_METHOD_LABELS,
  PLAN_UNITS,
  SUBSCRIPTION_STATUSES,
  ROLE_LABELS,
  WEEKDAYS,
  COACH_TOPICS,
  LEVEL_VALUE,
};
