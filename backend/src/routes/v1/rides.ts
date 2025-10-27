import express from 'express';
import { createRide } from '../../controllers/rideController';
const router = express.Router();

router.post('/', createRide);

export default router;
