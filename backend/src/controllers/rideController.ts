import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import {
  AuthenticatedRequest,
  CreateRideRequest,
  RideType,
  CancelRideRequest,
} from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import { BadRequestError } from '../core/ApiError';
import * as rideService from '../services/rideService';

/**
 * Create new ride request
 * POST /api/v1/rides
 */
export const createRide = asyncHandler(async (req: Request, res: Response) => {
  const request: CreateRideRequest = {
    riderId: req.body.rider_id,
    pickup: req.body.pickup,
    dropoff: req.body.dropoff,
    rideType: req.body.ride_type as RideType,
    paymentMethodId: req.body.payment_method_id,
    notes: req.body.notes,
    scheduledAt: req.body.scheduled_at ? new Date(req.body.scheduled_at) : undefined,
    idempotencyKey: req.body.idempotency_key || `ride_${Date.now()}_${Math.random()}`,
  };

  // const result = await rideService.createRide(request);

  // if (!result.success || !result.data) {
  //   throw new BadRequestError('Failed to create ride');
  // }

  return new SuccessResponse('OK', null).send(res);
});

/**
 * Get ride by ID
 * GET /api/v1/rides/:id
 */
export const getRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // const result = await rideService.getRideById(id);

  // if (!result.success || !result.data) {
  //   throw new BadRequestError('Failed to get ride');
  // }

  return new SuccessResponse('OK', null).send(res);
});

/**
 * Get rider's ride history
 * GET /api/v1/rides/rider/:riderId/history
 */
export const getRiderHistory = asyncHandler(async (req: Request, res: Response) => {
  const { riderId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  // const result = await rideService.getRiderRideHistory(riderId, {
  //   page,
  //   limit,
  // });

  // if (!result.success || !result.data) {
  //   throw new BadRequestError('Failed to get ride history');
  // }

  return new SuccessResponse('OK', null).send(res);
});

/**
 * Cancel ride
 * POST /api/v1/rides/:id/cancel
 */
export const cancelRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: CancelRideRequest = {
    rideId: id,
    cancelledBy: req.body.cancelled_by || 'rider',
    reason: req.body.reason,
  };

  // const result = await rideService.cancelRide(request);

  // if (!result.success || !result.data) {
  //   throw new BadRequestError('Failed to get cancel ride');
  // }

  return new SuccessResponse('OK', null).send(res);
});
