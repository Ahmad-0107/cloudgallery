import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient();

// Puts every newly confirmed (including Google-federated) user into the default group.
export const handler: PostConfirmationTriggerHandler = async (event) => {
  await client.send(
    new AdminAddUserToGroupCommand({
      GroupName: process.env.GROUP_NAME ?? 'Users',
      Username: event.userName,
      UserPoolId: event.userPoolId,
    }),
  );
  return event;
};
