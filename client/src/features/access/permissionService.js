// Effective-permission endpoint over the single shared API client.
// Relative imports keep this module loadable by the Node-native tests.
import { apiClient } from '../../services/api/apiClient.js'
import { accessEndpoints } from '../../config/accessConfig.js'
import { readMyPermissions } from './permissionContract.js'

export function createPermissionService({ client }) {
  return Object.freeze({
    // Signed-in session: a 401 here is a real session failure, so it notifies
    // and the authentication state ends the session.
    async getMyPermissions({ signal } = {}) {
      const { data } = await client.get(accessEndpoints.myPermissions, { signal })
      return readMyPermissions(data)
    },
  })
}

export const permissionService = createPermissionService({ client: apiClient })
