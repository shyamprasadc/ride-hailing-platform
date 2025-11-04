import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { UpdateLocationRequest, AcceptRideRequest, DriverStatus } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import * as driverService from '../services/driverService';

/**
 * Update driver location
 * POST /v1/drivers/:id/location
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

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Update driver availability
 * POST /v1/drivers/:id/status
 */
const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const result = await driverService.updateDriverAvailability(id, status as DriverStatus);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Accept ride request
 * POST /v1/drivers/:id/accept
 */
const acceptRide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const request: AcceptRideRequest = {
    rideId: ride_id,
    driverId: id,
  };

  const result = await driverService.acceptRide(request);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Mark driver as arriving
 * POST /v1/drivers/:id/arriving
 */
const markArriving = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const result = await driverService.updateDriverArriving(ride_id, id);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Mark driver as arrived
 * POST /v1/drivers/:id/arrived
 */
const markArrived = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ride_id } = req.body;

  const result = await driverService.markDriverArrived(ride_id, id);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get driver by ID
 * GET /v1/drivers/:id
 */
const getDriver = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await driverService.getDriverById(id);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get driver earnings
 * GET /v1/drivers/:id/earnings
 */
const getEarnings = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const startDate = req.query.start_date
    ? new Date(req.query.start_date as string)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();

  const result = await driverService.getDriverEarnings(id, startDate, endDate);

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
