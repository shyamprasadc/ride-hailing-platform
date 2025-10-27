import express, { Request, Response, NextFunction } from 'express';
import { SuccessMsgResponse } from '../../core/ApiResponse';
import asyncHandler from '../../helpers/asyncHandler';
import drivers from './drivers';
import payments from './payments';
import rides from './rides';
import trips from './trips';
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) =>
    new SuccessMsgResponse('OK').send(res),
  ),
);

router.use('/drivers', drivers);
router.use('/payments', payments);
router.use('/rides', rides);
router.use('/trips', trips);

export default router;
