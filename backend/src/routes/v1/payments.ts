import express from 'express';
import payment from '../../controllers/paymentController';
const router = express.Router();

router.post('/', payment.processPayment);
router.get('/trip/:tripId', payment.getPaymentByTrip);
router.post('/:id/retry', payment.retryPayment);
router.post('/:id/refund', payment.refundPayment);

export default router;
