import { defineFunction } from '@aws-amplify/backend';

export const restFunction = defineFunction({
  name: 'rest-function',
  entry: './handler.ts',
  resourceGroupName: 'auth', // avoids cross-stack circular dependency with API stack
});
