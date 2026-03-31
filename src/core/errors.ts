// Central error formatting — clean, user-facing messages

export interface ShrimpError {
  code: string;
  message: string;     // clean, user-facing
  detail?: string;     // full error for logs
  retryable: boolean;
}

export function formatError(e: unknown): ShrimpError {
  if (e instanceof Error) {
    const msg = e.message;

    // Rate limit
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return {
        code: 'RATE_LIMITED',
        message: 'Rate limited by the model provider. Waiting before retrying.',
        detail: msg,
        retryable: true,
      };
    }

    // Auth
    if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('auth')) {
      return {
        code: 'AUTH_ERROR',
        message: 'Authentication failed. Check your API key.',
        detail: msg,
        retryable: false,
      };
    }

    // Model not found
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return {
        code: 'NOT_FOUND',
        message: 'Model or endpoint not found. Check your configuration.',
        detail: msg,
        retryable: false,
      };
    }

    // Network
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Cannot reach the model provider. Check your connection.',
        detail: msg,
        retryable: true,
      };
    }

    // Server error
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return {
        code: 'SERVER_ERROR',
        message: 'The model provider is having issues. Try again in a moment.',
        detail: msg,
        retryable: true,
      };
    }

    // Max retries
    if (msg.includes('Max retries')) {
      return {
        code: 'MAX_RETRIES',
        message: 'Could not reach the model after multiple attempts. The provider may be down.',
        detail: msg,
        retryable: false,
      };
    }

    // Default — truncate long messages
    return {
      code: 'UNKNOWN',
      message: msg.length > 200 ? msg.slice(0, 200) + '...' : msg,
      detail: msg,
      retryable: false,
    };
  }

  return {
    code: 'UNKNOWN',
    message: 'An unexpected error occurred.',
    detail: String(e),
    retryable: false,
  };
}
