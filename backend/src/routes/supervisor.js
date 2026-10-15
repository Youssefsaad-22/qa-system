import { Router } from 'express';
import { getPendingSkips, resolveSkip, getSupervisorStats, getAllCalls, getWorkerRecords, getWorkerSummary, getSamplingConfig, updateSamplingConfig } from '../controllers/supervisorController.js';
import { listUsers, createUser, deleteUser } from '../controllers/usersController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('SUPERVISOR'));

router.get('/pending-skips', getPendingSkips);
router.post('/resolve-skip', resolveSkip);
router.get('/stats', getSupervisorStats);
router.get('/calls', getAllCalls);
router.get('/worker-records', getWorkerRecords);
router.get('/worker-summary', getWorkerSummary);
router.get('/sampling-config', getSamplingConfig);
router.post('/sampling-config', updateSamplingConfig);
router.get('/users', listUsers);
router.post('/users', createUser);
router.delete('/users/:userId', deleteUser);

export default router;