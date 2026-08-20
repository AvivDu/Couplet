import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID!,
});

/**
 * Registers a new user in Cognito. Leaves the user UNCONFIRMED — Cognito emails
 * them a verification code natively; the caller must confirm via cognitoConfirmSignUp
 * before signing in.
 */
export function cognitoSignUp(email: string, password: string, username: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'preferred_username', Value: username }),
    ];

    userPool.signUp(email, password, attributes, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Confirms a signup using the code Cognito emailed the user.
 */
export function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Re-sends the signup confirmation code to the account's email.
 */
export function cognitoResendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.resendConfirmationCode((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Signs in an existing Cognito user.
 * Returns the access token and the preferred_username claim (read off the ID
 * token already fetched during sign-in — no extra network round-trip).
 */
export function cognitoSignIn(email: string, password: string): Promise<{ token: string; username: string }> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    // CURRENT: SRP (Secure Remote Password) — more secure.
    // The password never leaves the device; only a mathematical proof is sent to Cognito.
    // Downside: heavy BigInt computation (~9-11s on device) blocks the JS thread.
    //
    // TO SWITCH TO FASTER (USER_PASSWORD_AUTH):
    //   1. AWS Cognito Console → User Pool → App Client → enable ALLOW_USER_PASSWORD_AUTH
    //   2. Uncomment the line below:
    //      user.setAuthenticationFlowType('USER_PASSWORD_AUTH');
    //   Trade-off: password is sent in plaintext to Cognito (still protected by TLS, but
    //   strictly less secure than SRP). Login drops from ~12s to ~1-2s.
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve({
        token: session.getAccessToken().getJwtToken(),
        username: session.getIdToken().decodePayload().preferred_username,
      }),
      onFailure: reject,
    });
  });
}

/**
 * Sends a password-reset verification code to the account's email.
 */
export function cognitoForgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}

/**
 * Completes a password reset using the verification code sent by forgotPassword().
 */
export function cognitoConfirmPassword(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}
