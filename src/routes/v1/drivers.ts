import express from 'express';
import driver from '../../controllers/driverController';
const router = express.Router();

router.post('/:id/location', driver.updateLocation);
router.post('/:id/status', driver.updateStatus);
router.post('/:id/accept', driver.acceptRide);
router.post('/:id/arriving', driver.markArriving);
router.post('/:id/arrived', driver.markArrived);
router.get('/:id', driver.getDriver);
router.get('/:id/earnings', driver.getEarnings);

export default router;
