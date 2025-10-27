import express from 'express';
import {
  processPayment,
  getPaymentByTrip,
  retryPayment,
  refundPayment,
} from '../../controllers/paymentController';
const router = express.Router();

router.post('/', processPayment);
router.get('/trip/:tripId', getPaymentByTrip);
router.post('/:id/retry', retryPayment);
router.post('/:id/refund', refundPayment);

export default router;
