import { defineFunction } from '@aws-amplify/backend';

export const postConfirmation = defineFunction({
  name: 'post-confirmation',
  entry: './handler.ts',
  // Must match a group declared in auth/resource.ts
  environment: { GROUP_NAME: 'Users' },
  resourceGroupName: 'auth',
});
