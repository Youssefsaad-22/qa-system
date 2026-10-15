import { Router } from 'express';
import crypto from 'crypto';
import { getDirectusAgents } from '../sync/directusAgents.js';
import { markWebhookReceived } from '../sync/agentPoller.js';

const router = Router();

const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

router.post('/directus', async (req, res) => {
  const expected = process.env.DIRECTUS_WEBHOOK_SECRET;
  const received = req.get('x-directus-webhook-secret');

  if (!expected || !timingSafeEqual(received, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  markWebhookReceived();
  try {
    const agents = await getDirectusAgents(true);
    res.json({ ok: true, agents: agents.length, refreshedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Directus webhook refresh failed:', error.message);
    res.json({
      ok: false,
      agents: 0,
      error: error.message,
      refreshedAt: new Date().toISOString(),
    });
  }
});

export default router;