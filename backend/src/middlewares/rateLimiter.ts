import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../core/ApiError';
import { checkRateLimit as redisRateLimit } from '../utils/redis';

export const checkRateLimit = async (req: Request, res: Response, next: NextFunction) => {
  const identifier = req.ip;
  const result = await redisRateLimit(identifier, 100, 60);

  if (!result.allowed) {
    throw new TooManyRequestsError();
  }

  res.set('X-RateLimit-Limit', String(result.limit));
  res.set('X-RateLimit-Remaining', String(result.limit - result.current));
  next();
};
