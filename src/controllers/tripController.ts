import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { StartTripRequest, EndTripRequest } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import * as tripService from '../services/tripService';

/**
 * Start trip
 * POST /v1/trips/:id/start
 */
const startTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: StartTripRequest = {
    tripId: id,
    startOtp: req.body.start_otp,
  };

  const result = await tripService.startTrip(request);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * End trip
 * POST /v1/trips/:id/end
 */
const endTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const request: EndTripRequest = {
    tripId: id,
    endLocation: req.body.end_location,
    actualDistance: req.body.actual_distance,
    routePath: req.body.route_path,
  };

  const result = await tripService.endTrip(request);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get trip by ID
 * GET /v1/trips/:id
 */
const getTrip = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await tripService.getTripById(id);

  return new SuccessResponse('OK', result.data).send(res);
});

export default {
  startTrip,
  endTrip,
  getTrip,
};
