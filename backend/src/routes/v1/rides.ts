import express from 'express';
import { createRide, getRide, getRiderHistory, cancelRide } from '../../controllers/rideController';
const router = express.Router();

router.post('/', createRide);
router.get('/:id', getRide);
router.get('/rider/:riderId/history', getRiderHistory);
router.post('/:id/cancel', cancelRide);

export default router;
