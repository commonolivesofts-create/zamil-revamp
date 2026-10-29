// Approval states of the employee services routes. DRAFT: not submitted yet;
// PENDING: with this approver; WAITING: an earlier approver signs first;
// APPROVED: signed. The server assigns them; the demo adapter derives them
// from the request status with routeStates.
export const APPROVAL_STATES = Object.freeze(['DRAFT', 'PENDING', 'WAITING', 'APPROVED'])

export function routeStates(route, status) {
  return route.map((_, index) => {
    if (status === 'APPROVED') return 'APPROVED'
    if (status === 'SUBMITTED') return index === 0 ? 'PENDING' : 'WAITING'
    return 'DRAFT'
  })
}
