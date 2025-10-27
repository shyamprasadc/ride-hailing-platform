import { PrismaClient } from '@prisma/client';
import {
  ProcessPaymentRequest,
  PaymentResponse,
  PaymentStatus,
  TripStatus,
  Result,
  NotFoundError,
  ValidationError,
} from '../core/Types';
import { checkIdempotency, storeIdempotentResponse, getIdempotentResponse } from '../utils/redis';
const prisma = new PrismaClient();

/**
 * Process payment for a trip
 */
export const processPayment = async (
  request: ProcessPaymentRequest
): Promise<Result<PaymentResponse>> => {
  try {
    // Check idempotency
    const idempotencyKey = `payment:${request.idempotencyKey}`;
    const isFirstRequest = await checkIdempotency(idempotencyKey, 3600);

    if (!isFirstRequest) {
      // Return cached response
      const cachedResponse = await getIdempotentResponse<PaymentResponse>(idempotencyKey);
      if (cachedResponse) {
        return { success: true, data: cachedResponse };
      }
    }

    return await prisma.$transaction(async (tx) => {
      // Get trip details
      const trip = await tx.trip.findUnique({
        where: { id: request.tripId },
        include: { ride: true },
      });

      if (!trip) {
        return {
          success: false,
          error: new NotFoundError('Trip not found'),
        };
      }

      if (trip.status !== TripStatus.COMPLETED) {
        return {
          success: false,
          error: new ValidationError('Trip not completed'),
        };
      }

      // Check if payment already exists
      const existingPayment = await tx.payment.findUnique({
        where: { tripId: request.tripId },
      });

      if (existingPayment?.status === PaymentStatus.COMPLETED) {
        const response: PaymentResponse = {
          id: existingPayment.id,
          tripId: existingPayment.tripId,
          amount: existingPayment.amount,
          status: existingPayment.status as PaymentStatus,
          pspTransactionId: existingPayment.pspTransactionId || undefined,
          createdAt: existingPayment.createdAt,
          completedAt: existingPayment.completedAt || undefined,
        };
        return { success: true, data: response };
      }

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          tripId: request.tripId,
          paymentMethodId: request.paymentMethodId,
          amount: trip.finalFare,
          currency: 'INR',
          status: PaymentStatus.PENDING,
          idempotencyKey: request.idempotencyKey,
          attempts: 1,
        },
      });

      // Process payment with PSP (mock for now)
      const pspResponse = await processPSPPayment(trip.finalFare, request.paymentMethodId);

      // Update payment with PSP response
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: pspResponse.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          pspTransactionId: pspResponse.transactionId,
          pspResponse: pspResponse,
          completedAt: pspResponse.success ? new Date() : undefined,
          failedAt: pspResponse.success ? undefined : new Date(),
          failureReason: pspResponse.success ? undefined : pspResponse.error,
        },
      });

      // Create notification
      await tx.notification.create({
        data: {
          riderId: trip.ride.riderId,
          type: pspResponse.success ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
          title: pspResponse.success ? 'Payment Successful' : 'Payment Failed',
          message: pspResponse.success
            ? `₹${trip.finalFare.toFixed(2)} paid successfully`
            : 'Payment failed. Please try again.',
          rideId: trip.rideId,
        },
      });

      const response: PaymentResponse = {
        id: updatedPayment.id,
        tripId: updatedPayment.tripId,
        amount: updatedPayment.amount,
        status: updatedPayment.status as PaymentStatus,
        pspTransactionId: updatedPayment.pspTransactionId || undefined,
        createdAt: updatedPayment.createdAt,
        completedAt: updatedPayment.completedAt || undefined,
      };

      // Store response for idempotency
      await storeIdempotentResponse(idempotencyKey, response, 3600);

      return { success: true, data: response };
    });
  } catch (error) {
    console.error('Error processing payment:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Mock PSP payment processing
 * In production, integrate with actual PSP like Stripe/Razorpay
 */
const processPSPPayment = async (
  amount: number,
  paymentMethodId: string
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> => {
  try {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock success (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
    } else {
      return {
        success: false,
        error: 'Insufficient funds',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment failed',
    };
  }
};

/**
 * Get payment by trip ID
 */
export const getPaymentByTripId = async (tripId: string): Promise<Result<PaymentResponse>> => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { tripId },
    });

    if (!payment) {
      return {
        success: false,
        error: new NotFoundError('Payment not found'),
      };
    }

    const response: PaymentResponse = {
      id: payment.id,
      tripId: payment.tripId,
      amount: payment.amount,
      status: payment.status as PaymentStatus,
      pspTransactionId: payment.pspTransactionId || undefined,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt || undefined,
    };

    return { success: true, data: response };
  } catch (error) {
    console.error('Error getting payment:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Retry failed payment
 */
export const retryPayment = async (paymentId: string): Promise<Result<PaymentResponse>> => {
  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { trip: true },
      });

      if (!payment) {
        return {
          success: false,
          error: new NotFoundError('Payment not found'),
        };
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        return {
          success: false,
          error: new ValidationError('Payment already completed'),
        };
      }

      if (payment.attempts >= payment.maxAttempts) {
        return {
          success: false,
          error: new ValidationError('Maximum retry attempts reached'),
        };
      }

      // Update payment status
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.PROCESSING,
          attempts: { increment: 1 },
        },
      });

      // Process payment with PSP
      const pspResponse = await processPSPPayment(payment.amount, payment.paymentMethodId || '');

      // Update payment with result
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: pspResponse.success ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
          pspTransactionId: pspResponse.transactionId,
          pspResponse: pspResponse,
          completedAt: pspResponse.success ? new Date() : undefined,
          failedAt: pspResponse.success ? undefined : new Date(),
          failureReason: pspResponse.success ? undefined : pspResponse.error,
        },
      });

      const response: PaymentResponse = {
        id: updatedPayment.id,
        tripId: updatedPayment.tripId,
        amount: updatedPayment.amount,
        status: updatedPayment.status as PaymentStatus,
        pspTransactionId: updatedPayment.pspTransactionId || undefined,
        createdAt: updatedPayment.createdAt,
        completedAt: updatedPayment.completedAt || undefined,
      };

      return { success: true, data: response };
    });
  } catch (error) {
    console.error('Error retrying payment:', error);
    return { success: false, error: error as Error };
  }
};

/**
 * Process refund
 */
export const processRefund = async (
  paymentId: string,
  amount: number,
  reason: string
): Promise<Result<{ refundId: string; status: string }>> => {
  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        return {
          success: false,
          error: new NotFoundError('Payment not found'),
        };
      }

      if (payment.status !== PaymentStatus.COMPLETED) {
        return {
          success: false,
          error: new ValidationError('Payment not completed'),
        };
      }

      if (amount > payment.amount) {
        return {
          success: false,
          error: new ValidationError('Refund amount exceeds payment amount'),
        };
      }

      // Create refund record
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount,
          reason,
          status: 'PENDING',
        },
      });

      // Process refund with PSP (mock)
      const pspRefundResponse = {
        success: true,
        refundId: `rfnd_${Date.now()}`,
      };

      // Update refund status
      const updatedRefund = await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: pspRefundResponse.success ? 'COMPLETED' : 'FAILED',
          pspRefundId: pspRefundResponse.refundId,
          completedAt: pspRefundResponse.success ? new Date() : undefined,
        },
      });

      // Update payment status
      if (pspRefundResponse.success) {
        const isFullRefund = amount === payment.amount;
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: isFullRefund ? PaymentStatus.REFUNDED : ('PARTIALLY_REFUNDED' as PaymentStatus),
            refundedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        data: {
          refundId: updatedRefund.id,
          status: updatedRefund.status,
        },
      };
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    return { success: false, error: error as Error };
  }
};

export const paymentService = {
  processPayment,
  getPaymentByTripId,
  retryPayment,
  processRefund,
};
