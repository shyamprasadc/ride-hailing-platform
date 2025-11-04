import { Request, Response } from 'express';
import asyncHandler from '../helpers/asyncHandler';
import { ProcessPaymentRequest } from '../core/Types';
import { SuccessResponse } from '../core/ApiResponse';
import { paymentService } from '../services/paymentService';

/**
 * Process payment
 * POST /v1/payments
 */
const processPayment = asyncHandler(async (req: Request, res: Response) => {
  const request: ProcessPaymentRequest = {
    tripId: req.body.trip_id,
    paymentMethodId: req.body.payment_method_id,
    idempotencyKey: req.body.idempotency_key || `payment_${Date.now()}`,
  };

  const result = await paymentService.processPayment(request);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Get payment by trip ID
 * GET /v1/payments/trip/:tripId
 */
const getPaymentByTrip = asyncHandler(async (req: Request, res: Response) => {
  const { tripId } = req.params;

  const result = await paymentService.getPaymentByTripId(tripId);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Retry payment
 * POST /v1/payments/:id/retry
 */
const retryPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await paymentService.retryPayment(id);

  return new SuccessResponse('OK', result.data).send(res);
});

/**
 * Process refund
 * POST /v1/payments/:id/refund
 */
const refundPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  const result = await paymentService.processRefund(id, amount, reason);

  return new SuccessResponse('OK', result.data).send(res);
});

export default {
  processPayment,
  getPaymentByTrip,
  retryPayment,
  refundPayment,
};
