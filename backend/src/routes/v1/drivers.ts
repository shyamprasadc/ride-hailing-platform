import express from 'express';
import { updateLocation } from '../../controllers/driverController';
const router = express.Router();

router.post('/:id/location', updateLocation);

export default router;
