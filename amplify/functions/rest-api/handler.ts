import type { APIGatewayProxyHandler } from 'aws-lambda';

const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Request', { path: event.path, method: event.httpMethod }); // goes to CloudWatch Logs
  if (event.path.endsWith('/health')) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
  }
  const claims = event.requestContext.authorizer?.claims ?? {};
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      email: claims.email,
      groups: String(claims['cognito:groups'] ?? '')
        .replace(/[[\]]/g, '')
        .split(/[ ,]+/)
        .filter(Boolean),
      time: new Date().toISOString(),
    }),
  };
};
