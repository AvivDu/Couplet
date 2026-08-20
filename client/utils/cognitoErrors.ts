// Maps amazon-cognito-identity-js error codes to user-facing messages.
// Used by any screen that submits a Cognito verification/reset code.
export function friendlyCognitoError(err: any): string {
  const code = err?.code;
  if (code === 'CodeMismatchException') return 'That code is incorrect. Please check your email and try again.';
  if (code === 'ExpiredCodeException') return 'That code has expired. Tap "Resend" to get a new one.';
  if (code === 'LimitExceededException' || code === 'TooManyRequestsException' || code === 'TooManyFailedAttemptsException')
    return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'InvalidPasswordException') return 'Password does not meet the requirements. Please choose a stronger password.';
  if (code === 'UsernameExistsException') return 'An account with this email already exists — check your inbox for a code, or log in.';
  return err?.message ?? 'Something went wrong. Please try again.';
}
