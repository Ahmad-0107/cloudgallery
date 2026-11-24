import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'cloudgalleryPhotos',
  access: (allow) => ({
    'photos/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']), // owner
      allow.authenticated.to(['read']), // all signed-in users can view
    ],
  }),
});
