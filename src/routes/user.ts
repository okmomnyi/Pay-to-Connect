import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import UserController from '../controllers/userController';
import { authenticateUser } from '../middleware/userAuth';

const router = Router();
const userController = new UserController();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Public user endpoints
router.post('/register', authLimiter, userController.register);
router.post('/login', authLimiter, userController.login);

// Protected user endpoints
router.use(authenticateUser);
router.get('/profile', userController.getProfile);
router.post('/devices', userController.addDevice);

export default router;
