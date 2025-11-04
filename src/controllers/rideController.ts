import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { CreateRideRequest, RideType, CancelRideRequest } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import * as rideService from '../services/rideService';

/**
 * Create new ride request
 * POST /v1/rides
 */
const createRide = asyncHandler(async (req: Request, res: Response) => {
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

  const result = await rideService.createRide(request);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get ride by ID
 * GET /v1/rides/:id
 */
const getRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await rideService.getRideById(id);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get rider's ride history
 * GET /v1/rides/rider/:riderId/history
 */
const getRiderHistory = asyncHandler(async (req: Request, res: Response) => {
  const { riderId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const result = await rideService.getRiderRideHistory(riderId, {
    page,
    limit,
  });

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Cancel ride
 * POST /v1/rides/:id/cancel
 */
const cancelRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: CancelRideRequest = {
    rideId: id,
    cancelledBy: req.body.cancelled_by || 'rider',
    reason: req.body.reason,
  };

  const result = await rideService.cancelRide(request);

  return new SuccessResponse('OK', result.data).send(res);
});

export default {
  createRide,
  getRide,
  getRiderHistory,
  cancelRide,
};
