// Libellés partagés (français / arabe)

const MUSCLES = {
  pectoraux: { fr: 'Pectoraux', ar: 'الصدر' },
  dos: { fr: 'Dos', ar: 'الظهر' },
  epaules: { fr: 'Épaules', ar: 'الأكتاف' },
  biceps: { fr: 'Biceps', ar: 'الباي' },
  triceps: { fr: 'Triceps', ar: 'التراي' },
  quadriceps: { fr: 'Quadriceps', ar: 'الفخذ الأمامي' },
  ischios: { fr: 'Ischio-jambiers', ar: 'الفخذ الخلفي' },
  fessiers: { fr: 'Fessiers', ar: 'الأرداف' },
  mollets: { fr: 'Mollets', ar: 'السمانة' },
  abdos: { fr: 'Abdominaux', ar: 'البطن' },
};

const PATTERNS = {
  poussee_horizontale: { fr: 'Poussée horizontale', ar: 'دفع أفقي' },
  poussee_verticale: { fr: 'Poussée verticale', ar: 'دفع عمودي' },
  tirage_horizontal: { fr: 'Tirage horizontal', ar: 'سحب أفقي' },
  tirage_vertical: { fr: 'Tirage vertical', ar: 'سحب عمودي' },
  squat: { fr: 'Squat', ar: 'قرفصاء' },
  charniere: { fr: 'Charnière de hanche', ar: 'ثني الورك' },
  fente: { fr: 'Fente', ar: 'طعن' },
  isolation: { fr: 'Isolation', ar: 'عزل' },
  gainage: { fr: 'Gainage', ar: 'ثبات' },
};

const INJURY_ZONES = {
  epaule: { fr: 'Épaule', ar: 'الكتف' },
  genou: { fr: 'Genou', ar: 'الركبة' },
  dos: { fr: 'Bas du dos', ar: 'أسفل الظهر' },
  poignet: { fr: 'Poignet', ar: 'المعصم' },
  coude: { fr: 'Coude', ar: 'المرفق' },
  cheville: { fr: 'Cheville', ar: 'الكاحل' },
};

const LEVEL_VALUE = { DEBUTANT: 1, INTERMEDIAIRE: 2, AVANCE: 3 };

module.exports = { MUSCLES, PATTERNS, INJURY_ZONES, LEVEL_VALUE };
