import { ES_COMMON_TEXT } from '../hrEmployeeServicesText.js'
import '@/styles/hr-employee-services.css'

// Approval route as signature boxes: who, in which role, and the state the
// server reports (Draft / Pending / Waiting / Approved).
export function ApprovalSigns({ items }) {
  return (
    <div className="zrv-hr-signs zrv-hr-mt">
      {items.map((item) => (
        <div key={item.key} className={`zrv-hr-sign zrv-hr-sign--approve zrv-hr-es-sign zrv-hr-is-${item.state.toLowerCase()}`}>
          <div className="zrv-hr-sign__pad">{ES_COMMON_TEXT.approval[item.state]}{item.date ? ` · ${item.date}` : ''}</div>
          <b>{item.name}</b>
          <small>{item.role}</small>
        </div>
      ))}
    </div>
  )
}

// A character counter for a limited text ('near' over 90 %, 'over' above the limit).
export function Counter({ id, length, max, state }) {
  return <span id={id} className={`zrv-hr-es-count${state ? ` zrv-hr-is-${state}` : ''}`}>{ES_COMMON_TEXT.counter(length, max)}</span>
}
