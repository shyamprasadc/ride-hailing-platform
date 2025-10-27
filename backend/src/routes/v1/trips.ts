import express from 'express';
import trip from '../../controllers/tripController';
const router = express.Router();

router.post('/:id/start', trip.startTrip);
router.post('/:id/end', trip.endTrip);
router.get('/:id', trip.getTrip);

export default router;
