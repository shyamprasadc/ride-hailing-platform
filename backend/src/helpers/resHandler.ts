import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthenticatedRequest } from '../core/Types';

// ==================== HELPER FUNCTIONS ====================

/**
 * Send error response
 */
export const sendErrorResponse = (res: Response, error: Error, statusCode: number = 500) => {
  return res.status(statusCode).json({
    success: false,
    error: error.message,
  });
};

/**
 * Send success response
 */
export const sendSuccessResponse = <T>(res: Response, data: T, statusCode: number = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

/**
 * Check validation errors
 */
export const checkValidationErrors = (req: AuthenticatedRequest, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      errors: errors.array(),
    });
    return false;
  }
  return true;
};
