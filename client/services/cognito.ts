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
 * Registers a new user in Cognito, then immediately signs them in.
 * Requires a PreSignUp Lambda trigger on the User Pool that auto-confirms users.
 * Returns the Cognito access token.
 */
export function cognitoSignUp(email: string, password: string, username: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'preferred_username', Value: username }),
    ];

    userPool.signUp(email, password, attributes, [], (err) => {
      if (err) return reject(err);
      // User is auto-confirmed by the PreSignUp Lambda — sign in immediately
      cognitoSignIn(email, password).then(resolve).catch(reject);
    });
  });
}

/**
 * Signs in an existing Cognito user.
 * Returns the Cognito access token.
 */
export function cognitoSignIn(email: string, password: string): Promise<string> {
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
      onSuccess: (session) => resolve(session.getAccessToken().getJwtToken()),
      onFailure: reject,
    });
  });
}
