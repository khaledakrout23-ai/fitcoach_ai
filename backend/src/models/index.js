const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { jsonArray, jsonObject, decimal } = require('./helpers');

const ROLES = ['SPORTIF', 'GERANT', 'ACCUEIL', 'TECHNICIEN', 'COACH', 'ADMIN'];
const PAYMENT_METHODS = ['ESPECES', 'CARTE', 'D17', 'FLOUCI', 'VIREMENT'];

// ---------------------------------------------------------------- Utilisateurs
const User = sequelize.define(
  'User',
  {
    name: { type: DataTypes.STRING(100), allowNull: false },
    // membres : téléphone obligatoire (identifiant de connexion) ; équipe et admin : e-mail obligatoire
    email: { type: DataTypes.STRING(150), allowNull: true, unique: true, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING(20), allowNull: true, unique: true }, // format +216XXXXXXXX
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: 'SPORTIF' },
    language: { type: DataTypes.ENUM('fr', 'ar', 'en'), allowNull: false, defaultValue: 'fr' },
    theme: { type: DataTypes.ENUM('dark', 'light', 'system'), allowNull: false, defaultValue: 'dark' },

    // profil sportif (rempli à l'onboarding)
    sex: { type: DataTypes.ENUM('H', 'F', 'NA') },
    birthYear: { type: DataTypes.INTEGER },
    age: {
      type: DataTypes.VIRTUAL,
      get() {
        const y = this.getDataValue('birthYear');
        return y ? new Date().getFullYear() - y : null;
      },
    },
    weight: { type: DataTypes.FLOAT }, // kg
    height: { type: DataTypes.INTEGER }, // cm
    goalWeight: { type: DataTypes.FLOAT }, // kg
    goal: { type: DataTypes.ENUM('PRISE_MASSE', 'PERTE_POIDS', 'FORCE', 'FORME') }, // FORCE = « améliorer ma performance »
    level: { type: DataTypes.ENUM('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE') },
    activity: { type: DataTypes.ENUM('SEDENTAIRE', 'LEGER', 'ACTIF', 'TRES_ACTIF') },
    trainingDays: jsonArray(DataTypes, 'trainingDays'), // 0 = lundi … 6 = dimanche
    daysPerWeek: { type: DataTypes.INTEGER }, // = trainingDays.length (gardé pour le générateur)
    sessionMinutes: { type: DataTypes.INTEGER }, // 30 | 45 | 60 | 90
    injuries: jsonArray(DataTypes, 'injuries'), // ex. ["genou", "epaule"]
    dietStyle: { type: DataTypes.ENUM('EQUILIBRE', 'PROTEINES', 'VEGETARIEN', 'LOW_CARB') },
    healthConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    onboardedAt: { type: DataTypes.DATE },
    prefs: jsonObject(DataTypes, 'prefs'), // notifications, alerte salle calme, objectif d'eau manuel…
    accessActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // carte d'accès (QR)

    // sécurité du compte
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    tempPasswordExpiresAt: { type: DataTypes.DATE },
    passwordChangedAt: { type: DataTypes.DATE },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedLogins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lockedUntil: { type: DataTypes.DATE },
    lastLoginAt: { type: DataTypes.DATE },
    deletedAt: { type: DataTypes.DATE }, // compte supprimé à la demande du membre (données anonymisées)
  },
  {
    tableName: 'users',
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  }
);

// ---------------------------------------------------------------- Salles
const Gym = sequelize.define(
  'Gym',
  {
    name: { type: DataTypes.STRING(120), allowNull: false },
    address: { type: DataTypes.STRING(200) },
    city: { type: DataTypes.STRING(80) },
    phone: { type: DataTypes.STRING(30) },
    capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    hours: jsonObject(DataTypes, 'hours'), // { week: ['06:00','23:00'], sat: [...], sun: [...], ramadan: {...} }
    settings: jsonObject(DataTypes, 'settings'), // voir services/gymSettings.js (valeurs par défaut fusionnées à la lecture)
  },
  { tableName: 'gyms' }
);

// Types d'équipement (haltères, presse à cuisses, poulie...)
const Equipment = sequelize.define(
  'Equipment',
  {
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    nameFr: { type: DataTypes.STRING(80), allowNull: false },
    nameAr: { type: DataTypes.STRING(80), allowNull: false },
    category: { type: DataTypes.ENUM('MACHINE', 'LIBRE', 'POIDS_DU_CORPS'), allowNull: false },
  },
  { tableName: 'equipment' }
);

// Un équipement présent dans une salle
const Machine = sequelize.define(
  'Machine',
  {
    label: { type: DataTypes.STRING(100), allowNull: false },
    code: { type: DataTypes.STRING(10) }, // numéro affiché « #09 », unique dans la salle
    zone: { type: DataTypes.STRING(40) }, // Machines, Poids libres, Cardio…
    status: { type: DataTypes.ENUM('OK', 'SIGNALEE', 'REPARATION'), allowNull: false, defaultValue: 'OK' },
    outOfService: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // RG6 : plus proposée dans les séances
    lastMaintenanceAt: { type: DataTypes.DATEONLY },
  },
  { tableName: 'machines', indexes: [{ unique: true, fields: ['gym_id', 'code'] }] }
);

// ---------------------------------------------------------------- Exercices
const Exercise = sequelize.define(
  'Exercise',
  {
    nameFr: { type: DataTypes.STRING(120), allowNull: false },
    nameAr: { type: DataTypes.STRING(120), allowNull: false },
    nameEn: { type: DataTypes.STRING(120), allowNull: false },
    primaryMuscle: { type: DataTypes.STRING(30), allowNull: false },
    secondaryMuscles: jsonArray(DataTypes, 'secondaryMuscles'),
    pattern: { type: DataTypes.STRING(30), allowNull: false }, // type de mouvement
    accessories: jsonArray(DataTypes, 'accessories'), // équipements secondaires (ex. banc)
    difficulty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, // 1 à 3
    injuryZones: jsonArray(DataTypes, 'injuryZones'), // zones sollicitées
    defaultReps: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '8-12' },
    defaultSets: jsonObject(DataTypes, 'defaultSets'), // { DEBUTANT: '3x12', INTERMEDIAIRE: '3x10', AVANCE: '4x8' }
    alternativeIds: jsonArray(DataTypes, 'alternativeIds'), // remplacements choisis à la main, dans l'ordre
    benefitsFr: jsonArray(DataTypes, 'benefitsFr'),
    benefitsAr: jsonArray(DataTypes, 'benefitsAr'),
    mistakesFr: jsonArray(DataTypes, 'mistakesFr'),
    mistakesAr: jsonArray(DataTypes, 'mistakesAr'),
    videoUrl: { type: DataTypes.STRING(255) }, // lien YouTube choisi par l'administrateur
  },
  { tableName: 'exercises' }
);

// ---------------------------------------------------------------- Programmes
const Program = sequelize.define(
  'Program',
  {
    title: { type: DataTypes.STRING(150), allowNull: false },
    source: { type: DataTypes.ENUM('IA', 'REGLES', 'MODELE'), allowNull: false },
    goal: { type: DataTypes.STRING(20) },
    daysPerWeek: { type: DataTypes.INTEGER, allowNull: false },
    weeks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
    startedAt: { type: DataTypes.DATEONLY },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: 'programs' }
);

const ProgramItem = sequelize.define(
  'ProgramItem',
  {
    dayIndex: { type: DataTypes.INTEGER, allowNull: false },
    dayLabelFr: { type: DataTypes.STRING(60), allowNull: false },
    dayLabelAr: { type: DataTypes.STRING(60), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    sets: { type: DataTypes.INTEGER, allowNull: false },
    reps: { type: DataTypes.STRING(20), allowNull: false },
    restSec: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'program_items' }
);

// Modèle de programme d'une salle (écran « Programmes » du coach), attribué selon l'objectif et les jours
const ProgramTemplate = sequelize.define(
  'ProgramTemplate',
  {
    nameFr: { type: DataTypes.STRING(120), allowNull: false },
    nameAr: { type: DataTypes.STRING(120), allowNull: false },
    goal: { type: DataTypes.ENUM('PRISE_MASSE', 'PERTE_POIDS', 'FORCE', 'FORME'), allowNull: false },
    level: { type: DataTypes.ENUM('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE') }, // null = tous niveaux
    daysPerWeek: { type: DataTypes.INTEGER, allowNull: false },
    weeks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // [{ labelFr, labelAr, focusFr, focusAr, items: [{ exerciseId, sets, reps, restSec }] }]
    days: jsonArray(DataTypes, 'days'),
  },
  { tableName: 'program_templates' }
);

// ---------------------------------------------------------------- Séances
const WorkoutSession = sequelize.define(
  'WorkoutSession',
  {
    dayIndex: { type: DataTypes.INTEGER, allowNull: false },
    dayLabelFr: { type: DataTypes.STRING(60) },
    dayLabelAr: { type: DataTypes.STRING(60) },
    status: { type: DataTypes.ENUM('EN_COURS', 'TERMINEE'), allowNull: false, defaultValue: 'EN_COURS' },
    quick: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finishedAt: { type: DataTypes.DATE },
    rating: { type: DataTypes.INTEGER }, // 1 à 5
  },
  { tableName: 'workout_sessions' }
);

const SessionEntry = sequelize.define(
  'SessionEntry',
  {
    position: { type: DataTypes.INTEGER, allowNull: false },
    targetSets: { type: DataTypes.INTEGER, allowNull: false },
    targetReps: { type: DataTypes.STRING(20), allowNull: false },
    restSec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 90 },
    reason: { type: DataTypes.ENUM('OCCUPEE', 'ABSENTE', 'PANNE') }, // rempli si l'exercice a été remplacé
    setsDone: jsonArray(DataTypes, 'setsDone'), // [{ reps: 10, weight: 40 }]
  },
  { tableName: 'session_entries' }
);

// ---------------------------------------------------------------- Salle : pannes
const REPORT_ISSUES = ['NE_MARCHE_PAS', 'CABLE', 'REGLAGE', 'PIECE_CASSEE', 'BRUIT', 'ECRAN', 'AUTRE'];
const Report = sequelize.define(
  'Report',
  {
    issueType: { type: DataTypes.ENUM(...REPORT_ISSUES), allowNull: false, defaultValue: 'AUTRE' },
    description: { type: DataTypes.STRING(500) },
    status: { type: DataTypes.ENUM('NOUVEAU', 'VU', 'REPARATION', 'REPAREE', 'REJETE'), allowNull: false, defaultValue: 'NOUVEAU' },
    notify: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // prévenir l'auteur quand c'est réparé
    internalNote: { type: DataTypes.STRING(500) }, // visible par l'équipe seulement
    seenAt: { type: DataTypes.DATE },
    repairStartedAt: { type: DataTypes.DATE },
    repairedAt: { type: DataTypes.DATE },
    photo: { type: DataTypes.BLOB('medium') }, // JPEG/PNG/WebP vérifié (octets magiques), servi par une route protégée
    photoType: { type: DataTypes.STRING(20) },
    hasPhoto: {
      type: DataTypes.VIRTUAL,
      get() {
        return Boolean(this.getDataValue('photoType'));
      },
    },
  },
  {
    tableName: 'reports',
    defaultScope: { attributes: { exclude: ['photo'] } },
    scopes: { withPhoto: { attributes: { include: ['photo'] } } },
  }
);

// ---------------------------------------------------------------- Salle : formules, abonnements, paiements, caisse
const Plan = sequelize.define(
  'Plan',
  {
    nameFr: { type: DataTypes.STRING(60), allowNull: false },
    nameAr: { type: DataTypes.STRING(60), allowNull: false },
    nameEn: { type: DataTypes.STRING(60) },
    duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    durationUnit: { type: DataTypes.ENUM('DAY', 'MONTH'), allowNull: false, defaultValue: 'MONTH' },
    price: decimal(DataTypes, 'price'), // TND
    accessHours: { type: DataTypes.ENUM('ALL', 'OFF_PEAK'), allowNull: false, defaultValue: 'ALL' },
    inApp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // achat dans l'app (D17 / Flouci)
    freezeDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // gel autorisé (jours)
    noteFr: { type: DataTypes.STRING(120) }, // ex. « carte étudiant demandée »
    noteAr: { type: DataTypes.STRING(120) },
    visible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'plans' }
);

const Subscription = sequelize.define(
  'Subscription',
  {
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: decimal(DataTypes, 'amount'), // prix payé en TND (3 décimales : millimes)
    paymentMethod: { type: DataTypes.ENUM(...PAYMENT_METHODS), allowNull: false, defaultValue: 'ESPECES' },
    note: { type: DataTypes.STRING(200) },
    frozenFrom: { type: DataTypes.DATEONLY },
    frozenUntil: { type: DataTypes.DATEONLY },
    freezeDaysUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'subscriptions' }
);

const Payment = sequelize.define(
  'Payment',
  {
    amount: decimal(DataTypes, 'amount'),
    method: { type: DataTypes.ENUM(...PAYMENT_METHODS), allowNull: false },
    kind: { type: DataTypes.ENUM('ABONNEMENT', 'INSCRIPTION', 'SEANCE'), allowNull: false },
    label: { type: DataTypes.STRING(100) }, // ex. « Visiteur » pour une séance unique
  },
  { tableName: 'payments', updatedAt: false } // un paiement ne se modifie pas
);

const CashSession = sequelize.define(
  'CashSession',
  {
    openedAt: { type: DataTypes.DATE, allowNull: false },
    openingFloat: decimal(DataTypes, 'openingFloat'),
    closedAt: { type: DataTypes.DATE },
    expectedCash: { ...decimal(DataTypes, 'expectedCash'), allowNull: true, defaultValue: null },
    countedCash: { ...decimal(DataTypes, 'countedCash'), allowNull: true, defaultValue: null },
    note: { type: DataTypes.STRING(200) },
  },
  { tableName: 'cash_sessions' }
);

// ---------------------------------------------------------------- Entrées (scanner de l'accueil, lecteurs)
const CheckIn = sequelize.define(
  'CheckIn',
  {
    checkInAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    checkOutAt: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('ENTREE', 'REFUSEE'), allowNull: false, defaultValue: 'ENTREE' },
    refusalReason: { type: DataTypes.ENUM('EXPIRE', 'GELE', 'AUCUN', 'DESACTIVE', 'HORS_HORAIRES') },
    source: { type: DataTypes.ENUM('SCAN', 'MANUEL', 'LECTEUR'), allowNull: false, defaultValue: 'SCAN' },
  },
  { tableName: 'checkins', indexes: [{ fields: ['gym_id', 'check_in_at'] }] }
);

// ---------------------------------------------------------------- Coach
const ChatMessage = sequelize.define(
  'ChatMessage',
  {
    role: { type: DataTypes.ENUM('user', 'assistant'), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    offline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // proposition attachée à une réponse du coach : { type: 'SWAP', ... } ou { type: 'ADD_PAIN', zone }
    proposal: { ...jsonObject(DataTypes, 'proposal'), allowNull: true },
    proposalState: { type: DataTypes.ENUM('PENDING', 'APPLIED', 'DISMISSED') },
    topic: { type: DataTypes.STRING(20) }, // sujet détecté (statistiques anonymes du coach)
  },
  { tableName: 'chat_messages' }
);

// ---------------------------------------------------------------- Nutrition et eau
const NutritionTarget = sequelize.define(
  'NutritionTarget',
  {
    calories: { type: DataTypes.INTEGER, allowNull: false }, // kcal
    protein: { type: DataTypes.INTEGER, allowNull: false }, // g
    carbs: { type: DataTypes.INTEGER, allowNull: false }, // g
    fat: { type: DataTypes.INTEGER, allowNull: false }, // g
    maintenance: { type: DataTypes.INTEGER }, // kcal pour un poids stable
    waterMl: { type: DataTypes.INTEGER }, // objectif d'eau un jour d'entraînement
    source: { type: DataTypes.ENUM('IA', 'REGLES'), allowNull: false },
    advice: { type: DataTypes.TEXT }, // conseil court de l'IA
  },
  { tableName: 'nutrition_targets' }
);

const Meal = sequelize.define(
  'Meal',
  {
    date: { type: DataTypes.DATEONLY, allowNull: false }, // jour local du sportif
    mealType: { type: DataTypes.ENUM('PETIT_DEJ', 'DEJEUNER', 'DINER', 'COLLATION'), allowNull: false, defaultValue: 'DEJEUNER' },
    name: { type: DataTypes.STRING(150), allowNull: false },
    quantity: { type: DataTypes.STRING(60) }, // « 1 bol », « 150 g »
    calories: { type: DataTypes.INTEGER, allowNull: false },
    protein: { type: DataTypes.INTEGER, allowNull: false },
    carbs: { type: DataTypes.INTEGER, allowNull: false },
    fat: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'meals', indexes: [{ fields: ['user_id', 'date'] }] }
);

// Aliments : catalogue Kammel (gymId et userId nuls), ajoutés par la salle, ou créés par le membre
const Food = sequelize.define(
  'Food',
  {
    nameFr: { type: DataTypes.STRING(120), allowNull: false },
    nameAr: { type: DataTypes.STRING(120), allowNull: false },
    nameEn: { type: DataTypes.STRING(120) },
    portion: { type: DataTypes.STRING(60), allowNull: false }, // « 1 bol · 250 g »
    calories: { type: DataTypes.INTEGER, allowNull: false },
    protein: { type: DataTypes.INTEGER, allowNull: false },
    carbs: { type: DataTypes.INTEGER, allowNull: false },
    fat: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'foods' }
);

const WaterLog = sequelize.define(
  'WaterLog',
  {
    date: { type: DataTypes.DATEONLY, allowNull: false },
    ml: { type: DataTypes.INTEGER, allowNull: false },
    drink: { type: DataTypes.ENUM('EAU', 'THE', 'CAFE', 'JUS', 'SHAKE'), allowNull: false, defaultValue: 'EAU' },
    kcal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // boissons sucrées
  },
  { tableName: 'water_logs', updatedAt: false, indexes: [{ fields: ['user_id', 'date'] }] }
);

// ---------------------------------------------------------------- Notifications dans l'app
const Campaign = sequelize.define(
  'Campaign',
  {
    audience: { type: DataTypes.ENUM('ALL', 'EXPIRING', 'INACTIVE', 'NEW', 'EXPIRED', 'REPORTERS'), allowNull: false },
    kind: { type: DataTypes.ENUM('MESSAGE', 'EXPIRY', 'CALM', 'REPAIRED', 'INACTIVE', 'WELCOME'), allowNull: false, defaultValue: 'MESSAGE' },
    auto: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    channel: { type: DataTypes.ENUM('APP', 'SMS'), allowNull: false, defaultValue: 'APP' },
    titleFr: { type: DataTypes.STRING(120), allowNull: false },
    bodyFr: { type: DataTypes.STRING(500), allowNull: false },
    titleAr: { type: DataTypes.STRING(120) },
    bodyAr: { type: DataTypes.STRING(500) },
    scheduledAt: { type: DataTypes.DATE },
    sentAt: { type: DataTypes.DATE },
    recipients: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'campaigns' }
);

const Notification = sequelize.define(
  'Notification',
  {
    kind: { type: DataTypes.ENUM('MESSAGE', 'EXPIRY', 'CALM', 'REPAIRED', 'INACTIVE', 'WELCOME', 'SYSTEM'), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    body: { type: DataTypes.STRING(500), allowNull: false },
    link: { type: DataTypes.STRING(120) }, // route interne de l'app (jamais une URL externe)
    readAt: { type: DataTypes.DATE },
  },
  { tableName: 'notifications', updatedAt: false, indexes: [{ fields: ['user_id', 'created_at'] }] }
);

// ---------------------------------------------------------------- Journal des actions de l'équipe
const AuditLog = sequelize.define(
  'AuditLog',
  {
    action: { type: DataTypes.STRING(60), allowNull: false }, // ex. member.create, payment.create, plan.update
    targetType: { type: DataTypes.STRING(30) },
    targetId: { type: DataTypes.INTEGER },
    details: { ...jsonObject(DataTypes, 'details'), allowNull: true },
  },
  { tableName: 'audit_logs', updatedAt: false, indexes: [{ fields: ['gym_id', 'created_at'] }] }
);

// ---------------------------------------------------------------- Codes envoyés par e-mail (mot de passe oublié de l'équipe)
const EmailCode = sequelize.define(
  'EmailCode',
  {
    purpose: { type: DataTypes.ENUM('VERIFY', 'RESET'), allowNull: false },
    codeHash: { type: DataTypes.STRING(64), allowNull: false }, // SHA-256 du code à 6 chiffres
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'email_codes' }
);

// ---------------------------------------------------------------- Relations
Gym.hasMany(User, { as: 'members', foreignKey: 'gymId' });
User.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
// constraints: false évite une dépendance circulaire users <-> gyms
Gym.belongsTo(User, { as: 'manager', foreignKey: 'managerId', constraints: false });

Gym.hasMany(Machine, { as: 'machines', foreignKey: 'gymId', onDelete: 'CASCADE' });
Machine.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
Equipment.hasMany(Machine, { as: 'machines', foreignKey: 'equipmentId' });
Machine.belongsTo(Equipment, { as: 'equipment', foreignKey: 'equipmentId' });

Equipment.hasMany(Exercise, { as: 'exercises', foreignKey: 'equipmentId' });
Exercise.belongsTo(Equipment, { as: 'equipment', foreignKey: 'equipmentId' });

User.hasMany(Program, { as: 'programs', foreignKey: 'userId', onDelete: 'CASCADE' });
Program.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Program.hasMany(ProgramItem, { as: 'items', foreignKey: 'programId', onDelete: 'CASCADE' });
ProgramItem.belongsTo(Program, { as: 'program', foreignKey: 'programId' });
ProgramItem.belongsTo(Exercise, { as: 'exercise', foreignKey: 'exerciseId' });
Program.belongsTo(ProgramTemplate, { as: 'template', foreignKey: 'templateId', onDelete: 'SET NULL', constraints: false });
Gym.hasMany(ProgramTemplate, { as: 'programTemplates', foreignKey: 'gymId', onDelete: 'CASCADE' });
ProgramTemplate.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

User.hasMany(WorkoutSession, { as: 'sessions', foreignKey: 'userId', onDelete: 'CASCADE' });
WorkoutSession.belongsTo(User, { as: 'user', foreignKey: 'userId' });
WorkoutSession.belongsTo(Program, { as: 'program', foreignKey: 'programId', onDelete: 'SET NULL' });
WorkoutSession.hasMany(SessionEntry, { as: 'entries', foreignKey: 'sessionId', onDelete: 'CASCADE' });
SessionEntry.belongsTo(WorkoutSession, { as: 'session', foreignKey: 'sessionId' });
SessionEntry.belongsTo(Exercise, { as: 'exercise', foreignKey: 'exerciseId' });
SessionEntry.belongsTo(Exercise, { as: 'originalExercise', foreignKey: 'originalExerciseId' });

Machine.hasMany(Report, { as: 'reports', foreignKey: 'machineId', onDelete: 'CASCADE' });
Report.belongsTo(Machine, { as: 'machine', foreignKey: 'machineId' });
Report.belongsTo(User, { as: 'author', foreignKey: 'userId' });
Report.belongsTo(User, { as: 'assignedTo', foreignKey: 'assignedToId', constraints: false });
Report.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

Gym.hasMany(Plan, { as: 'plans', foreignKey: 'gymId', onDelete: 'CASCADE' });
Plan.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

User.hasMany(Subscription, { as: 'subscriptions', foreignKey: 'userId', onDelete: 'CASCADE' });
Subscription.belongsTo(User, { as: 'member', foreignKey: 'userId' });
Subscription.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
Subscription.belongsTo(Plan, { as: 'plan', foreignKey: 'planId', constraints: false });
Subscription.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', constraints: false });

Gym.hasMany(Payment, { as: 'payments', foreignKey: 'gymId', onDelete: 'CASCADE' });
Payment.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
Payment.belongsTo(User, { as: 'member', foreignKey: 'userId', constraints: false });
Payment.belongsTo(User, { as: 'receivedBy', foreignKey: 'receivedById', constraints: false });
Payment.belongsTo(Subscription, { as: 'subscription', foreignKey: 'subscriptionId', constraints: false });
Payment.belongsTo(Plan, { as: 'plan', foreignKey: 'planId', constraints: false });
Payment.belongsTo(CashSession, { as: 'cashSession', foreignKey: 'cashSessionId', constraints: false });

Gym.hasMany(CashSession, { as: 'cashSessions', foreignKey: 'gymId', onDelete: 'CASCADE' });
CashSession.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
CashSession.belongsTo(User, { as: 'openedBy', foreignKey: 'openedById', constraints: false });
CashSession.belongsTo(User, { as: 'closedBy', foreignKey: 'closedById', constraints: false });

User.hasMany(CheckIn, { as: 'checkins', foreignKey: 'userId', onDelete: 'CASCADE' });
CheckIn.belongsTo(User, { as: 'user', foreignKey: 'userId' });
CheckIn.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
CheckIn.belongsTo(User, { as: 'byStaff', foreignKey: 'byStaffId', constraints: false });

User.hasMany(ChatMessage, { as: 'messages', foreignKey: 'userId', onDelete: 'CASCADE' });
ChatMessage.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.hasOne(NutritionTarget, { as: 'nutritionTarget', foreignKey: { name: 'userId', unique: true }, onDelete: 'CASCADE' });
NutritionTarget.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Meal, { as: 'meals', foreignKey: 'userId', onDelete: 'CASCADE' });
Meal.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Meal.belongsTo(Food, { as: 'food', foreignKey: 'foodId', constraints: false });
Food.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId', onDelete: 'CASCADE' });
Food.belongsTo(User, { as: 'owner', foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(WaterLog, { as: 'waterLogs', foreignKey: 'userId', onDelete: 'CASCADE' });
WaterLog.belongsTo(User, { as: 'user', foreignKey: 'userId' });

Gym.hasMany(Campaign, { as: 'campaigns', foreignKey: 'gymId', onDelete: 'CASCADE' });
Campaign.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });
Campaign.belongsTo(User, { as: 'createdBy', foreignKey: 'createdById', constraints: false });
User.hasMany(Notification, { as: 'notifications', foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Notification.belongsTo(Campaign, { as: 'campaign', foreignKey: 'campaignId', constraints: false });
Notification.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId', constraints: false });

AuditLog.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId', constraints: false });
AuditLog.belongsTo(User, { as: 'actor', foreignKey: 'actorId', constraints: false });

User.hasMany(EmailCode, { as: 'emailCodes', foreignKey: 'userId', onDelete: 'CASCADE' });
EmailCode.belongsTo(User, { as: 'user', foreignKey: 'userId' });

module.exports = {
  sequelize,
  ROLES,
  PAYMENT_METHODS,
  REPORT_ISSUES,
  User,
  Gym,
  Equipment,
  Machine,
  Exercise,
  Program,
  ProgramItem,
  ProgramTemplate,
  WorkoutSession,
  SessionEntry,
  Report,
  Plan,
  Subscription,
  Payment,
  CashSession,
  CheckIn,
  ChatMessage,
  NutritionTarget,
  Meal,
  Food,
  WaterLog,
  Campaign,
  Notification,
  AuditLog,
  EmailCode,
};
