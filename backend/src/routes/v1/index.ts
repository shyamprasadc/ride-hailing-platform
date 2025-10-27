import express, { Request, Response, NextFunction } from 'express';
import { SuccessMsgResponse } from '../../core/ApiResponse';
import asyncHandler from '../../helpers/asyncHandler';
const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response, next: NextFunction) =>
    new SuccessMsgResponse('OK').send(res),
  ),
);

export default router;
