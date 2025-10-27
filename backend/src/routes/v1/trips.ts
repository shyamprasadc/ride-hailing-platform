import express from 'express';
import { startTrip } from '../../controllers/tripController';
const router = express.Router();

router.post('/', startTrip);

export default router;
