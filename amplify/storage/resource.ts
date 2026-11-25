import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'cloudgalleryPhotos',
  access: (allow) => ({
    'photos/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
      allow.groups(['Users', 'Admins']).to(['read', 'write', 'delete']),
    ],
  }),
});
