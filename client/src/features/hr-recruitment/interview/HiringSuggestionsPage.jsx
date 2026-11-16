import { InterviewSuggestions } from './InterviewSuggestions.jsx'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/hr-hiring-suggestions.css'

// The standalone Hiring suggestions page. The content is the original
// suggestions panel, restored unchanged and given the room it needs as its own
// page; the page shell only supplies the shared HR scope and spacing.
export default function HiringSuggestionsPage() {
  return (
    <div className="zrv-hr zrv-hs">
      <InterviewSuggestions />
    </div>
  )
}
