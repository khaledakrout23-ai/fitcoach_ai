const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { jsonArray, decimal } = require('./helpers');

// ---------------------------------------------------------------- Utilisateurs
const User = sequelize.define(
  'User',
  {
    name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING(100), allowNull: false },
    role: { type: DataTypes.ENUM('SPORTIF', 'GERANT', 'ADMIN'), allowNull: false, defaultValue: 'SPORTIF' },
    language: { type: DataTypes.ENUM('fr', 'ar'), allowNull: false, defaultValue: 'fr' },
    age: { type: DataTypes.INTEGER },
    weight: { type: DataTypes.FLOAT }, // kg
    height: { type: DataTypes.INTEGER }, // cm
    goal: { type: DataTypes.ENUM('PRISE_MASSE', 'PERTE_POIDS', 'FORCE', 'FORME') },
    level: { type: DataTypes.ENUM('DEBUTANT', 'INTERMEDIAIRE', 'AVANCE') },
    daysPerWeek: { type: DataTypes.INTEGER },
    injuries: jsonArray(DataTypes, 'injuries'), // ex. ["genou", "epaule"]
    healthConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // adresse confirmée par code
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
    openingHours: { type: DataTypes.STRING(120) },
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
    status: { type: DataTypes.ENUM('OK', 'PANNE'), allowNull: false, defaultValue: 'OK' },
  },
  { tableName: 'machines' }
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
    source: { type: DataTypes.ENUM('IA', 'REGLES'), allowNull: false },
    goal: { type: DataTypes.STRING(20) },
    daysPerWeek: { type: DataTypes.INTEGER, allowNull: false },
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

// ---------------------------------------------------------------- Séances
const WorkoutSession = sequelize.define(
  'WorkoutSession',
  {
    dayIndex: { type: DataTypes.INTEGER, allowNull: false },
    dayLabelFr: { type: DataTypes.STRING(60) },
    dayLabelAr: { type: DataTypes.STRING(60) },
    status: { type: DataTypes.ENUM('EN_COURS', 'TERMINEE'), allowNull: false, defaultValue: 'EN_COURS' },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finishedAt: { type: DataTypes.DATE },
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

// ---------------------------------------------------------------- Salle : pannes, abonnements, présence
const Report = sequelize.define(
  'Report',
  {
    description: { type: DataTypes.STRING(255) },
    status: { type: DataTypes.ENUM('NOUVEAU', 'CONFIRME', 'RESOLU', 'REJETE'), allowNull: false, defaultValue: 'NOUVEAU' },
  },
  { tableName: 'reports' }
);

const Subscription = sequelize.define(
  'Subscription',
  {
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: decimal(DataTypes, 'amount'), // en TND (3 décimales : millimes)
    paymentMethod: { type: DataTypes.ENUM('ESPECES', 'CARTE', 'VIREMENT'), allowNull: false, defaultValue: 'ESPECES' },
    note: { type: DataTypes.STRING(200) },
  },
  { tableName: 'subscriptions' }
);

const CheckIn = sequelize.define(
  'CheckIn',
  {
    checkInAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    checkOutAt: { type: DataTypes.DATE },
  },
  { tableName: 'checkins' }
);

const ChatMessage = sequelize.define(
  'ChatMessage',
  {
    role: { type: DataTypes.ENUM('user', 'assistant'), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    offline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: 'chat_messages' }
);

// ---------------------------------------------------------------- Nutrition
// Objectif journalier du sportif (calculé par l'IA, sinon par formule)
const NutritionTarget = sequelize.define(
  'NutritionTarget',
  {
    calories: { type: DataTypes.INTEGER, allowNull: false }, // kcal
    protein: { type: DataTypes.INTEGER, allowNull: false }, // g
    carbs: { type: DataTypes.INTEGER, allowNull: false }, // g
    fat: { type: DataTypes.INTEGER, allowNull: false }, // g
    source: { type: DataTypes.ENUM('IA', 'REGLES'), allowNull: false },
    advice: { type: DataTypes.TEXT }, // conseil court de l'IA
  },
  { tableName: 'nutrition_targets' }
);

// Repas enregistré (valeurs estimées par l'IA à partir d'une photo, corrigeables par le sportif)
const Meal = sequelize.define(
  'Meal',
  {
    date: { type: DataTypes.DATEONLY, allowNull: false }, // jour local du sportif
    name: { type: DataTypes.STRING(150), allowNull: false },
    calories: { type: DataTypes.INTEGER, allowNull: false },
    protein: { type: DataTypes.INTEGER, allowNull: false },
    carbs: { type: DataTypes.INTEGER, allowNull: false },
    fat: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'meals', indexes: [{ fields: ['user_id', 'date'] }] } // colonnes en snake_case dans MySQL
);

// ---------------------------------------------------------------- Codes envoyés par e-mail
// Vérification de l'adresse (VERIFY) ou réinitialisation du mot de passe (RESET)
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
Report.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

User.hasMany(Subscription, { as: 'subscriptions', foreignKey: 'userId', onDelete: 'CASCADE' });
Subscription.belongsTo(User, { as: 'member', foreignKey: 'userId' });
Subscription.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

User.hasMany(CheckIn, { as: 'checkins', foreignKey: 'userId', onDelete: 'CASCADE' });
CheckIn.belongsTo(User, { as: 'user', foreignKey: 'userId' });
CheckIn.belongsTo(Gym, { as: 'gym', foreignKey: 'gymId' });

User.hasMany(ChatMessage, { as: 'messages', foreignKey: 'userId', onDelete: 'CASCADE' });
ChatMessage.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.hasOne(NutritionTarget, { as: 'nutritionTarget', foreignKey: { name: 'userId', unique: true }, onDelete: 'CASCADE' });
NutritionTarget.belongsTo(User, { as: 'user', foreignKey: 'userId' });
User.hasMany(Meal, { as: 'meals', foreignKey: 'userId', onDelete: 'CASCADE' });
Meal.belongsTo(User, { as: 'user', foreignKey: 'userId' });

User.hasMany(EmailCode, { as: 'emailCodes', foreignKey: 'userId', onDelete: 'CASCADE' });
EmailCode.belongsTo(User, { as: 'user', foreignKey: 'userId' });

module.exports = {
  sequelize,
  User,
  Gym,
  Equipment,
  Machine,
  Exercise,
  Program,
  ProgramItem,
  WorkoutSession,
  SessionEntry,
  Report,
  Subscription,
  CheckIn,
  ChatMessage,
  NutritionTarget,
  Meal,
  EmailCode,
};
