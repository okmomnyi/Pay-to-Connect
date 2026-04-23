import { Router, Request, Response } from 'express';
import PortalController from '../controllers/portalController';
import { validateMpesaCallback, preventDuplicateCallback } from '../middleware/mpesaAuth';
import { logger } from '../utils/logger';

const router = Router();
const portalController = new PortalController();

// STK Push callback — reuses full validation + duplicate-prevention middleware
router.post('/stk', validateMpesaCallback, preventDuplicateCallback, portalController.handleMpesaCallback);

// B2C Result callback
router.post('/result', (req: Request, res: Response) => {
    res.json({ ResultCode: '00000000', ResultDesc: 'Accepted' });
    try {
        logger.info('M-Pesa B2C Result callback received:', JSON.stringify(req.body));
    } catch (err) {
        logger.error('Error logging B2C result callback:', err);
    }
});

// B2C Queue Timeout callback
router.post('/timeout', (req: Request, res: Response) => {
    res.json({ ResultCode: '00000000', ResultDesc: 'Accepted' });
    try {
        logger.info('M-Pesa B2C Timeout callback received:', JSON.stringify(req.body));
    } catch (err) {
        logger.error('Error logging B2C timeout callback:', err);
    }
});

// C2B Validation callback — must respond with ResultCode 0 to accept the transaction
router.post('/validation', (req: Request, res: Response) => {
    try {
        logger.info('M-Pesa C2B Validation callback received:', JSON.stringify(req.body));
    } catch (err) {
        logger.error('Error logging C2B validation callback:', err);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// C2B Confirmation callback
router.post('/confirmation', (req: Request, res: Response) => {
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    try {
        logger.info('M-Pesa C2B Confirmation callback received:', JSON.stringify(req.body));
    } catch (err) {
        logger.error('Error logging C2B confirmation callback:', err);
    }
});

export default router;
