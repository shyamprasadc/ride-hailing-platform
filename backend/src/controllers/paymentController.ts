import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { ProcessPaymentRequest } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import { BadRequestError } from '../core/ApiError';
import { paymentService } from '../services/paymentService';

/**
 * Process payment
 * POST /api/v1/payments
 */
export const processPayment = asyncHandler(async (req: Request, res: Response) => {
  const request: ProcessPaymentRequest = {
    tripId: req.body.trip_id,
    paymentMethodId: req.body.payment_method_id,
    idempotencyKey: req.body.idempotency_key || `payment_${Date.now()}`,
  };

  const result = await paymentService.processPayment(request);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to process payment');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get payment by trip ID
 * GET /api/v1/payments/trip/:tripId
 */
export const getPaymentByTrip = asyncHandler(async (req: Request, res: Response) => {
  const { tripId } = req.params;

  const result = await paymentService.getPaymentByTripId(tripId);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to get payment for trip');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Retry payment
 * POST /api/v1/payments/:id/retry
 */
export const retryPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await paymentService.retryPayment(id);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to retry payment');
  }

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Process refund
 * POST /api/v1/payments/:id/refund
 */
export const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  const result = await paymentService.processRefund(id, amount, reason);

  if (!result.success || !result.data) {
    throw new BadRequestError('Failed to process refund');
  }

  return new SuccessResponse('OK', result.data).send(res);
});
