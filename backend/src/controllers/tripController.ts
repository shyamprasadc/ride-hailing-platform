import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { StartTripRequest, EndTripRequest } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import { BadRequestError } from '../core/ApiError';
import * as tripService from '../services/tripService';

/**
 * Start trip
 * POST /api/v1/trips/:id/start
 */
export const startTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: StartTripRequest = {
    tripId: id,
    startOtp: req.body.start_otp,
  };

  const result = await tripService.startTrip(request);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to start trip');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * End trip
 * POST /api/v1/trips/:id/end
 */
export const endTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: EndTripRequest = {
    tripId: id,
    endLocation: req.body.end_location,
    actualDistance: req.body.actual_distance,
    routePath: req.body.route_path,
  };

  const result = await tripService.endTrip(request);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to end trip');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get trip by ID
 * GET /api/v1/trips/:id
 */
export const getTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await tripService.getTripById(id);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to get trip');
  }

  return new SuccessResponse('OK', result.data).send(res);
});
