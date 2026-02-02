/**
 * Error handling middleware
 */

import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * API Error class
 */
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends APIError {
  constructor(resource: string, id?: string) {
    super(
      404,
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      'NOT_FOUND'
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends APIError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    path?: string;
  };
}

/**
 * Error handling middleware
 */
export async function errorHandler(c: Context, next: Next): Promise<Response> {
  try {
    await next();
  } catch (error) {
    console.error('Request error:', error);

    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (error instanceof APIError) {
      statusCode = error.statusCode;
      code = error.code;
      message = error.message;
    } else if (error instanceof HTTPException) {
      statusCode = error.status;
      code = 'HTTP_ERROR';
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    const response: ErrorResponse = {
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        path: c.req.path,
      },
    };

    return c.json(response, statusCode as any);
  }

  return new Response('Not found', { status: 404 });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(c: Context): Response {
  const response: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${c.req.method} ${c.req.path}`,
      timestamp: new Date().toISOString(),
      path: c.req.path,
    },
  };

  return c.json(response, 404);
}

/**
 * Wrap async handlers for consistent error handling
 */
export function asyncHandler<T extends Context>(
  handler: (c: T) => Promise<Response>
): (c: T) => Promise<Response> {
  return async (c: T) => {
    try {
      return await handler(c);
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new APIError(500, error.message);
      }
      throw new APIError(500, 'Unknown error');
    }
  };
}
