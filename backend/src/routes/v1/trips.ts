import express from 'express';
import { startTrip, endTrip, getTrip } from '../../controllers/tripController';
const router = express.Router();

router.post('/:id/start', startTrip);
router.post('/:id/end', endTrip);
router.get('/:id', getTrip);

export default router;
