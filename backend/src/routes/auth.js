import { Router } from 'express';
import { login, getProfile, changePassword } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/loginLimit.js';

const router = Router();

router.post('/login', loginLimiter, login);
router.get('/profile', authenticateToken, getProfile);
router.post('/change-password', authenticateToken, changePassword);

export default router;