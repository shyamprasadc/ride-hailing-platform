import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { UpdateLocationRequest, AcceptRideRequest, DriverStatus } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import { BadRequestError } from '../core/ApiError';
import * as driverService from '../services/driverService';

/**
 * Update driver location
 * POST /api/v1/drivers/:id/location
 */
const updateLocation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const location: UpdateLocationRequest = {
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    heading: req.body.heading,
    speed: req.body.speed,
    accuracy: req.body.accuracy,
  };

  const result = await driverService.updateDriverLocation(id, location);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to update driver location');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Update driver availability
 * POST /api/v1/drivers/:id/status
 */
const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await driverService.updateDriverAvailability(id, status as DriverStatus);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to update driver status');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Accept ride request
 * POST /api/v1/drivers/:id/accept
 */
const acceptRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const request: AcceptRideRequest = {
    rideId: ride_id,
    driverId: id,
  };

  const result = await driverService.acceptRide(request);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to accept ride');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Mark driver as arriving
 * POST /api/v1/drivers/:id/arriving
 */
const markArriving = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const result = await driverService.updateDriverArriving(ride_id, id);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to update driver arriving status');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Mark driver as arrived
 * POST /api/v1/drivers/:id/arrived
 */
const markArrived = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const result = await driverService.markDriverArrived(ride_id, id);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to update driver arrived status');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get driver by ID
 * GET /api/v1/drivers/:id
 */
const getDriver = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await driverService.getDriverById(id);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to get driver');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get driver earnings
 * GET /api/v1/drivers/:id/earnings
 */
const getEarnings = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const startDate = req.query.start_date
    ? new Date(req.query.start_date as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();

  const result = await driverService.getDriverEarnings(id, startDate, endDate);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to get driver earnings');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

export default {
  updateLocation,
  updateStatus,
  acceptRide,
  markArriving,
  markArrived,
  getDriver,
  getEarnings,
};
