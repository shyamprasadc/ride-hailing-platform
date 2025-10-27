import express from 'express';
import ride from '../../controllers/rideController';
const router = express.Router();

router.post('/', ride.createRide);
router.get('/:id', ride.getRide);
router.get('/rider/:riderId/history', ride.getRiderHistory);
router.post('/:id/cancel', ride.cancelRide);

export default router;
