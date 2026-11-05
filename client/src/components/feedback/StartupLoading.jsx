import { appConfig } from '@/config/appConfig.js'
import './StartupLoading.css'

// Session restoration and initial route chunks share one quiet startup state.
// The short visual delay avoids flashing an indicator for a fast response.
export default function StartupLoading() {
  return (
    <div className="zrv-startup-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading application</span>
      <div className="zrv-startup-loading__visual" aria-hidden="true">
        <span className="zrv-startup-loading__brand">{appConfig.name}</span>
        <span className="zrv-startup-loading__track" />
      </div>
    </div>
  )
}
