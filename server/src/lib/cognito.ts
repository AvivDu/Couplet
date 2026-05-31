import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Shared Cognito access-token verifier. Created once at startup; env vars must
// be loaded before this module. Reused by the HTTP auth middleware and the
// WebSocket $connect handler so both validate tokens identically.
export const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'access',
  clientId: process.env.COGNITO_CLIENT_ID!,
});
