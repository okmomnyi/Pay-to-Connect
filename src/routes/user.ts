import { Router } from 'express';
import UserController from '../controllers/userController';
import { authenticateUser } from '../middleware/userAuth';

const router = Router();
const userController = new UserController();

// Public user endpoints
router.post('/register', userController.register);
router.post('/login', userController.login);

// Protected user endpoints
router.use(authenticateUser);
router.get('/profile', userController.getProfile);
router.post('/devices', userController.addDevice);

export default router;
