import express from 'express';
import { processPayment } from '../../controllers/paymentController';
const router = express.Router();

router.post('/', processPayment);

export default router;
