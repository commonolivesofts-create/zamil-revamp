import { useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { liveRequestRows } from '@/features/dashboard/liveRequestData.js'

const PAGE_SIZE = 5
const pageCount = Math.ceil(liveRequestRows.length / PAGE_SIZE)

// Original cc25-live-card, with React-owned pagination and preserved source data.
export default function LiveRequests() {
  const [page, setPage] = useState(1)
  const first = (page - 1) * PAGE_SIZE
  const currentRows = liveRequestRows.slice(first, first + PAGE_SIZE)
  const last = Math.min(first + PAGE_SIZE, liveRequestRows.length)

  return (
    <article className="cc25-card cc25-live-card">
      <div className="cc25-section-head">
        <span>
          <span className="cc25-icon"><OrvexaIcon name="radio" /></span>
          <span><h3>Live Requests</h3><p>Real-time request stream</p></span>
        </span>
        <span className="cc25-head-actions">
          <span className="cc25-live">Live</span>
          <Link className="cc25-link" to="/demo/requests-runs">View all</Link>
        </span>
      </div>
      <div className="cc25-table-wrap">
        <table className="cc25-table">
          <thead>
            <tr>
              <th scope="col">Time</th><th scope="col">Application</th><th scope="col">Model</th>
              <th scope="col">User</th><th scope="col">Tokens</th><th scope="col">Latency</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row) => (
              <tr key={`${row.time}-${row.user}`}>
                <td className="cc25-time">{row.time}</td>
                <td><span className="cc25-app-cell"><i><OrvexaIcon name={row.icon} /></i>{row.app}</span></td>
                <td>{row.model}</td>
                <td>{row.user}</td>
                <td>{row.tokens}</td>
                <td className={`cc25-latency ${row.latencyTone}`}>{row.latency}</td>
                <td><span className="cc25-status success">Success</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="cc25-pagination" aria-label="Live requests pagination">
        <span className="cc25-page-summary" aria-live="polite">{first + 1}–{last} of {liveRequestRows.length}</span>
        <button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><OrvexaIcon name="chevron-left" /></button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <button key={number} type="button" className={page === number ? 'active' : undefined}
            aria-current={page === number ? 'page' : undefined}
            aria-label={`Page ${number}`}
            onClick={() => setPage(number)}>{number}</button>
        ))}
        <button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><OrvexaIcon name="chevron-right" /></button>
      </nav>
    </article>
  )
}
