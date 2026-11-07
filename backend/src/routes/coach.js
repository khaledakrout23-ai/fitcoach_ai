// Discussion avec le coach Kammel. Le contexte de la séance est calculé ici (jamais envoyé par le client),
// et les propositions de changement sont déterministes : le texte de l'IA ne déclenche aucune action.
const router = require('express').Router();
const { ChatMessage, User, Gym, WorkoutSession, SessionEntry, Exercise, Equipment, Program, ProgramItem } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { oneOf, text } = require('../utils');
const { chatReply, referralText, addPainText } = require('../services/coach');
const { hasAI } = require('../services/gemini');
const { gymSettings } = require('../services/gymSettings');
const { alternativesFor } = require('../services/catalog');
const { todayView } = require('../services/programs');
const { detectTopic, detectPainZones, painDurationDays, matchExercise, refersToCurrentMachine, replyLanguage } = require('../services/coachRules');

router.use(auth, requireRole('SPORTIF'));

// Réglages de la salle ; coach désactivé → 403 COACH_DISABLED
async function coachSettings(req, { allowDisabled = false } = {}) {
  const gym = req.user.gymId ? await Gym.findByPk(req.user.gymId) : null;
  const settings = gymSettings(gym);
  if (!settings.features.coach && !allowDisabled) throw new HttpError(403, 'COACH_DISABLED', 'Le coach est désactivé par ta salle.');
  return { gym, settings };
}

const messageView = (m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  offline: m.offline,
  proposal: m.proposal && m.proposal.type ? m.proposal : null,
  proposalState: m.proposalState || null,
  createdAt: m.createdAt,
});

const names = (ex) => ({ fr: ex.nameFr, ar: ex.nameAr, en: ex.nameEn });

/** Séance en cours, sinon séance du jour : texte pour l'IA + exercices pouvant être remplacés */
async function sessionContext(user) {
  const session = await WorkoutSession.findOne({
    where: { userId: user.id, status: 'EN_COURS' },
    include: [
      {
        model: SessionEntry,
        as: 'entries',
        separate: true,
        include: [{ model: Exercise, as: 'exercise', include: [{ model: Equipment, as: 'equipment' }] }],
        order: [['position', 'ASC']],
      },
    ],
  });
  if (session) {
    const candidates = session.entries.map((e) => ({
      sessionId: session.id,
      entryId: e.id,
      exercise: e.exercise,
      sets: e.targetSets,
      reps: e.targetReps,
      done: e.setsDone.length >= e.targetSets,
    }));
    return {
      text: `Séance en cours (${session.dayLabelFr || 'séance'}) : ${candidates.map((c) => `${c.exercise.nameFr} ${c.sets}×${c.reps}${c.done ? ' (fait)' : ''}`).join(', ')}`,
      candidates,
      current: candidates.find((c) => !c.done) || null,
    };
  }
  const today = await todayView(user);
  if (!today) return { text: '', candidates: [], current: null };
  const candidates = today.items.map((it) => ({ programItemId: it.programItemId, exercise: it.exercise, sets: it.sets, reps: it.reps }));
  return {
    text: `${today.isToday ? 'Aujourd’hui' : `Prochaine séance (${today.date})`} : ${today.labelFr} — ${candidates.map((c) => `${c.exercise.nameFr} ${c.sets}×${c.reps}`).join(', ')}`,
    candidates,
    current: null,
  };
}

// « 3x12 » → { sets: 3, reps: '12' }
const parseSets = (value) => {
  const m = /^(\d{1,2})\s*x\s*(\d{1,3}(?:-\d{1,3})?)$/i.exec(String(value || '').trim());
  return m ? { sets: Number(m[1]), reps: m[2] } : null;
};

/** Proposition de remplacement si le membre parle d'une douleur ou d'une machine prise sur un exercice de sa séance */
async function swapProposal({ user, settings, content, topic, painZones, context }) {
  if (!settings.coach.proposeChanges || !['DOULEUR', 'REMPLACER'].includes(topic) || !context.candidates.length) return null;
  const named = matchExercise(content, context.candidates.map((c) => c.exercise));
  let target = named ? context.candidates.find((c) => c.exercise.id === named.id) : null;
  if (!target && topic === 'REMPLACER' && context.current && refersToCurrentMachine(content)) target = context.current;
  if (!target) return null;
  const { alternatives } = await alternativesFor(user.id, target.exercise.id, { limit: 1, extraInjuries: painZones });
  if (!alternatives.length) return null;
  const alt = await Exercise.findByPk(alternatives[0].exercise.id);
  const sets = parseSets((alt.defaultSets || {})[user.level || 'DEBUTANT']) || { sets: target.sets, reps: target.reps };
  return {
    type: 'SWAP',
    reason: topic === 'DOULEUR' ? 'DOULEUR' : 'OCCUPEE',
    ...(target.entryId ? { sessionId: target.sessionId, entryId: target.entryId } : { programItemId: target.programItemId }),
    fromExerciseId: target.exercise.id,
    toExerciseId: alt.id,
    fromName: names(target.exercise),
    toName: names(alt),
    sets: sets.sets,
    reps: sets.reps,
  };
}

router.get(
  '/messages',
  ah(async (req, res) => {
    await coachSettings(req);
    const messages = await ChatMessage.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 100 });
    res.json({ aiEnabled: hasAI(), messages: messages.reverse().map(messageView) });
  })
);

const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => `coach:${req.user.id}` });
router.post(
  '/messages',
  messageLimiter,
  ah(async (req, res) => {
    const { gym, settings } = await coachSettings(req);
    const content = text(req.body.content, 1000);
    if (!content) throw new HttpError(400, 'VALIDATION', 'Message vide.');
    const user = req.user;
    const topic = detectTopic(content);
    const language = replyLanguage(content, user.language, settings.coach.languages);
    const painZones = detectPainZones(content);
    const context = await sessionContext(user);
    const proposal = await swapProposal({ user, settings, content, topic, painZones, context });

    const history = await ChatMessage.findAll({ where: { userId: user.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 10 });
    const question = await ChatMessage.create({ userId: user.id, role: 'user', content, topic });
    const reply = await chatReply({ user, gym, settings, history: history.reverse(), message: content, language, topic, contextText: context.text, proposal });

    // douleur de plus de 3 jours : orientation vers un kiné (phrase ajoutée par le serveur)
    const days = painDurationDays(content);
    const referral = topic === 'DOULEUR' && settings.coach.safety.physioAfter3Days !== false && days != null && days >= 3;
    const answers = [
      await ChatMessage.create({
        userId: user.id,
        role: 'assistant',
        content: referral ? `${reply.content}\n\n${referralText(language, settings.coach.physio)}` : reply.content,
        offline: reply.offline,
        topic: referral ? 'ORIENTATION' : topic,
        proposal,
        proposalState: proposal ? 'PENDING' : null,
      }),
    ];
    // zone douloureuse absente du profil : proposer de l'ajouter (avec l'accord du membre)
    const newZone = painZones.find((z) => !(user.injuries || []).includes(z));
    if (newZone && settings.coach.addPainWithConsent && settings.features.painProgram) {
      answers.push(
        await ChatMessage.create({
          userId: user.id,
          role: 'assistant',
          content: addPainText(language, newZone),
          offline: true,
          topic,
          proposal: { type: 'ADD_PAIN', zone: newZone },
          proposalState: 'PENDING',
        })
      );
    }
    res.status(201).json({ question: messageView(question), answers: answers.map(messageView) });
  })
);

// Appliquer ou refuser une proposition du coach
router.post(
  '/messages/:id/proposal',
  ah(async (req, res) => {
    const { settings } = await coachSettings(req);
    const action = oneOf(req.body.action, ['APPLY', 'DISMISS'], 'action');
    const message = await ChatMessage.findOne({ where: { id: Number(req.params.id) || 0, userId: req.user.id, role: 'assistant' } });
    if (!message || !message.proposal.type) throw new HttpError(404, 'NOT_FOUND', 'Proposition introuvable.');
    if (message.proposalState !== 'PENDING') throw new HttpError(409, 'PROPOSAL_CLOSED', 'Cette proposition a déjà été traitée.');
    if (action === 'DISMISS') {
      await message.update({ proposalState: 'DISMISSED' });
      return res.json({ message: messageView(message), applied: null });
    }
    const p = message.proposal;
    const user = req.user;
    let applied;
    if (p.type === 'SWAP') {
      const outdated = () => new HttpError(409, 'PROPOSAL_OUTDATED', 'La séance a changé : cette proposition ne s’applique plus.');
      // contrôle de sécurité refait au moment d'appliquer (matériel en service, douleurs du profil)
      const { alternatives } = await alternativesFor(user.id, p.fromExerciseId, { limit: 100 });
      if (!alternatives.some((a) => a.exercise.id === p.toExerciseId)) throw outdated();
      if (p.entryId) {
        const entry = await SessionEntry.findOne({
          where: { id: p.entryId, exerciseId: p.fromExerciseId },
          include: [{ model: WorkoutSession, as: 'session', where: { userId: user.id, status: 'EN_COURS' } }],
        });
        if (!entry) throw outdated();
        await entry.update({
          originalExerciseId: entry.originalExerciseId || entry.exerciseId,
          exerciseId: p.toExerciseId,
          reason: p.reason === 'OCCUPEE' ? 'OCCUPEE' : null,
          targetSets: p.sets,
          targetReps: p.reps,
          setsDone: [],
        });
        applied = { type: 'SWAP', sessionId: entry.sessionId, entryId: entry.id };
      } else {
        const item = await ProgramItem.findOne({
          where: { id: p.programItemId || 0, exerciseId: p.fromExerciseId },
          include: [{ model: Program, as: 'program', where: { userId: user.id, active: true } }],
        });
        if (!item) throw outdated();
        await item.update({ exerciseId: p.toExerciseId, sets: p.sets, reps: p.reps });
        applied = { type: 'SWAP', programItemId: item.id };
      }
    } else if (p.type === 'ADD_PAIN') {
      if (!settings.coach.addPainWithConsent) throw new HttpError(403, 'FEATURE_DISABLED', 'Fonction désactivée par ta salle.');
      const fresh = await User.findByPk(user.id);
      if (!fresh.healthConsent) throw new HttpError(400, 'CONSENT_REQUIRED', 'Accord requis pour enregistrer tes données de santé.');
      const injuries = [...new Set([...(fresh.injuries || []), p.zone])];
      await fresh.update({ injuries });
      applied = { type: 'ADD_PAIN', injuries };
    } else {
      throw new HttpError(400, 'VALIDATION', 'Proposition inconnue.');
    }
    await message.update({ proposalState: 'APPLIED' });
    return res.json({ message: messageView(message), applied });
  })
);

router.delete(
  '/messages',
  ah(async (req, res) => {
    await ChatMessage.destroy({ where: { userId: req.user.id } });
    res.json({ ok: true });
  })
);

module.exports = router;
