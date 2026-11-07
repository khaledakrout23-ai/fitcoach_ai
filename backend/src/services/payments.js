// Paiements de la salle : moyen autorisé, lien avec la caisse ouverte. Un paiement ne se modifie jamais.
const { Op } = require('sequelize');
const { Payment, CashSession, PAYMENT_METHODS } = require('../models');
const { HttpError } = require('../middleware/errors');
const { oneOf } = require('../utils');

/** Moyen de paiement connu et activé dans les réglages de la salle */
function assertMethod(settings, method) {
  oneOf(method, PAYMENT_METHODS, 'method');
  if (!settings.paymentMethods[method]) throw new HttpError(400, 'PAYMENT_METHOD_DISABLED', 'Moyen de paiement désactivé dans les paramètres.');
  return method;
}

async function openCashSession(gymId, transaction) {
  return CashSession.findOne({ where: { gymId, closedAt: null }, order: [['openedAt', 'DESC']], transaction });
}

/**
 * Enregistre un paiement ; les espèces sont rattachées à la caisse ouverte.
 * @param {{ gymId, userId?, amount, method, kind, label?, planId?, subscriptionId?, receivedById }} data
 */
async function recordPayment(data, { transaction } = {}) {
  const cash = data.method === 'ESPECES' ? await openCashSession(data.gymId, transaction) : null;
  return Payment.create({ ...data, cashSessionId: cash ? cash.id : null }, { transaction });
}

/** Espèces encaissées pendant une session de caisse */
async function cashReceived(session) {
  const total = await Payment.sum('amount', { where: { cashSessionId: session.id, method: 'ESPECES' } });
  return Math.round((Number(total) || 0) * 1000) / 1000;
}

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Somme et nombre de paiements d'une salle sur une période [from, to[ */
async function totalBetween(gymId, from, to) {
  const where = { gymId, createdAt: { [Op.gte]: from, [Op.lt]: to } };
  const [amount, count] = await Promise.all([Payment.sum('amount', { where }), Payment.count({ where })]);
  return { amount: round3(amount), count };
}

module.exports = { assertMethod, openCashSession, recordPayment, cashReceived, totalBetween, round3 };
