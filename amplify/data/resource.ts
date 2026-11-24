import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

// GraphQL API (AWS AppSync). All operations require a Cognito-signed-in user.
const schema = a.schema({
  Photo: a
    .model({
      title: a.string().required(),
      s3Key: a.string().required(),
    })
    .authorization((allow) => [
      allow.owner(), // creator: full access
      allow.authenticated().to(['read']), // any signed-in user can view
      allow.group('Admins'), // admins can manage everything
    ]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
