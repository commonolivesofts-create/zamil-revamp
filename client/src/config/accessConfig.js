// Access-control endpoints are fixed by the backend contract
// (server/docs/openapi/openapi.yaml) and are relative to apiConfig.baseUrl.
export const accessEndpoints = Object.freeze({
  myPermissions: '/access-control/me/permissions',
})
