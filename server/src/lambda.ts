import serverless from 'serverless-http';
import app from './app';
import { wsHandler } from './ws/handler';

const httpHandler = serverless(app);

// A single Lambda serves both the HTTP API (via serverless-http) and the
// WebSocket API. WebSocket invocations carry a connectionId + routeKey on the
// request context; everything else is a normal HTTP proxy event.
export const handler = async (event: any, context: any) => {
  const rc = event?.requestContext;
  if (rc?.connectionId && rc?.routeKey) {
    return wsHandler(event);
  }
  return httpHandler(event, context);
};
