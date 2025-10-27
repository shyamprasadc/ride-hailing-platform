import express from 'express';
import {
  updateLocation,
  updateStatus,
  acceptRide,
  markArriving,
  markArrived,
  getDriver,
  getEarnings,
} from '../../controllers/driverController';
const router = express.Router();

router.post('/:id/location', updateLocation);
router.post('/:id/status', updateStatus);
router.post('/:id/accept', acceptRide);
router.post('/:id/arriving', markArriving);
router.post('/:id/arrived', markArrived);
router.get('/:id', getDriver);
router.get('/:id/earnings', getEarnings);

export default router;
