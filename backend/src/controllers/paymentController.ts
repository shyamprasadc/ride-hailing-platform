import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { SuccessResponse } from '../core/ApiResponse';

export const processPayment = asyncHandler(async (req: Request, res: Response) => {
  return new SuccessResponse('OK', null).send(res);
});
