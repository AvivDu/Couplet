import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';
import { installFastSrpMath } from './srpFastMath';

// Must run after the import above, since that is what installs enhance-rn.js's own
// modPow wrapper - this replaces it and keeps it as the fallback. Without it, SRP on
// Android overruns Cognito's 30s challenge window; see srpFastMath.ts.
installFastSrpMath();

const userPool = new CognitoUserPool({
  UserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID!,
  ClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID!,
});

/**
 * Registers a new user in Cognito. Leaves the user UNCONFIRMED - Cognito emails
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
 * token already fetched during sign-in - no extra network round-trip).
 */
export function cognitoSignIn(email: string, password: string): Promise<{ token: string; username: string }> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    // SRP (Secure Remote Password): the password never leaves the device, only a
    // mathematical proof is sent to Cognito. The bignum work runs on native BigInt
    // (installFastSrpMath, above) instead of the library's pure-JS fallback, which
    // keeps sign-in at ~1-2s on both platforms.
    //
    // Do NOT switch to USER_PASSWORD_AUTH for speed: it sends the password to Cognito
    // in the request body, and since srpFastMath there is no speed left to gain by it.
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
