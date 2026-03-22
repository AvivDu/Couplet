import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
);

export const USERS_TABLE   = process.env.DYNAMODB_USERS_TABLE!;
export const COUPONS_TABLE = process.env.DYNAMODB_COUPONS_TABLE!;
export const GROUPS_TABLE  = process.env.DYNAMODB_GROUPS_TABLE!;
