import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from '@/config/externalDestinations.js'

// A registry external destination: always a new tab with no opener and no
// referrer, and announced as such. `href` is already validated (https only) and
// the entry already passed routeAccess(); the destination system still
// authorizes its own users. Internal entries keep using React Router links.
export default function ExternalNavigationLink({ href, className, onClick, children }) {
  return (
    <a href={href} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL} className={className} onClick={onClick}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
