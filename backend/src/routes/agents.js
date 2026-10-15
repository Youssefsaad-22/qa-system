import { Router } from 'express';
import { listAgents } from '../controllers/agentsController.js';
import { getAgentSyncStatus } from '../sync/agentPoller.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', requireRole('QA_WORKER', 'SUPERVISOR'), listAgents);
router.get('/sync-status', requireRole('QA_WORKER', 'SUPERVISOR'), (req, res) => {
  res.json(getAgentSyncStatus());
});

export default router;