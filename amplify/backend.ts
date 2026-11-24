import { defineBackend } from '@aws-amplify/backend';
import { Stack, Duration } from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
  Cors,
} from 'aws-cdk-lib/aws-apigateway';
import { Dashboard, GraphWidget, Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { restFunction } from './functions/rest-api/resource';

const backend = defineBackend({ auth, data, storage, restFunction });

// ---- REST API (API Gateway + Lambda), protected by Cognito ----
const apiStack = backend.createStack('rest-api-stack');
const api = new RestApi(apiStack, 'RestApi', {
  restApiName: 'cloudgalleryRest',
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'Authorization'],
  },
});
const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'CognitoAuthorizer', {
  cognitoUserPools: [backend.auth.resources.userPool],
});
const integration = new LambdaIntegration(backend.restFunction.resources.lambda);
api.root.addResource('whoami').addMethod('GET', integration, {
  authorizer,
  authorizationType: AuthorizationType.COGNITO,
}); // protected
api.root.addResource('health').addMethod('GET', integration); // public

// ---- CloudWatch: dashboard + alarm ----
const fn = backend.restFunction.resources.lambda;
new Dashboard(apiStack, 'Dashboard', {
  dashboardName: 'cloudgallery-dashboard',
  widgets: [
    [
      new GraphWidget({ title: 'Lambda invocations', left: [fn.metricInvocations()] }),
      new GraphWidget({ title: 'Lambda errors', left: [fn.metricErrors()] }),
      new GraphWidget({
        title: 'API 4XX/5XX',
        left: [api.metricClientError(), api.metricServerError()],
      }),
    ],
  ],
});
// CHANGE THIS to your real email. AWS sends a confirmation link you must click.
const ALARM_EMAIL = 'l226293@lhr.nu.edu.pk';
const alarmTopic = new Topic(apiStack, 'AlarmTopic');
alarmTopic.addSubscription(new EmailSubscription(ALARM_EMAIL));

const errorAlarm = new Alarm(apiStack, 'LambdaErrorAlarm', {
  metric: fn.metricErrors({ period: Duration.minutes(5) }),
  threshold: 1,
  evaluationPeriods: 1,
  comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
  alarmDescription: 'REST Lambda reported an error',
});
errorAlarm.addAlarmAction(new SnsAction(alarmTopic));

backend.addOutput({
  custom: {
    API: {
      [api.restApiName]: {
        endpoint: api.url,
        region: Stack.of(api).region,
        apiName: api.restApiName,
      },
    },
  },
});
