import { Router } from 'express';
import { sampleCall, completeCall, skipCall, getAssignedCalls, getCallHistory, getAgents } from '../controllers/callsController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// QA Worker routes
router.post('/sample', requireRole('QA_WORKER', 'SUPERVISOR'), sampleCall);
router.post('/complete', requireRole('QA_WORKER', 'SUPERVISOR'), completeCall);
router.post('/skip', requireRole('QA_WORKER', 'SUPERVISOR'), skipCall);
router.get('/agents', requireRole('QA_WORKER', 'SUPERVISOR'), getAgents);
router.get('/assigned', requireRole('QA_WORKER', 'SUPERVISOR'), getAssignedCalls);
router.get('/history', requireRole('QA_WORKER', 'SUPERVISOR'), getCallHistory);

export default router;