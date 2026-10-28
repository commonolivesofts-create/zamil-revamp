import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Badge, Feedback } from '@/features/security-administration/components/AdminUi.jsx'
import { COMMON_TEXT, FLOW_TEXT } from '../../hrRecruitmentText.js'
import { hrRecruitmentDemo } from '../../hrRecruitmentService.js'
import { RECRUITMENT_FLOW as FLOW } from '../recruitmentFlow.js'
import '@/styles/hr-recruitment.css'

// Navigation between the three recruitment forms; the current one shows the
// number and status of the record being edited.
export function FlowNav({ current, status }) {
  const index = FLOW.findIndex((item) => item.id === current)
  return (
    <nav className="zrv-hr-flow" aria-label={FLOW_TEXT.label} style={{ '--f': index }}>
      <span className="zrv-hr-flow__line" aria-hidden="true"><i /></span>
      {FLOW.map((item, position) => {
        const on = item.id === current
        const text = FLOW_TEXT[item.id]
        return (
          <Link key={item.id} to={item.path} className={`zrv-hr-flow__step${on ? ' zrv-hr-is-on' : ''}`} aria-current={on ? 'page' : undefined}>
            <span className="zrv-hr-flow__n">{position + 1}</span>
            <span className="zrv-hr-flow__t"><b>{text.name}</b><small>{on && status ? status : text.hint}</small></span>
          </Link>
        )
      })}
    </nav>
  )
}

// Page header: breadcrumb, title, subtitle and the demo-data indicator.
export function RecruitmentHeader({ title, subtitle, showDemo = true }) {
  return (
    <header className="zrv-hr-head">
      <nav aria-label="Breadcrumb">
        <ol className="zrv-hr-crumb">
          {COMMON_TEXT.breadcrumb.map((item) => <li key={item}>{item}</li>)}
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      <div className="zrv-hr-head__row">
        <h1 className="zrv-hr-title" aria-label={title}>
          {title.split('').map((character, index) => (
            <span key={index} style={{ '--i': index }} aria-hidden="true">{character === ' ' ? ' ' : character}</span>
          ))}
        </h1>
        {showDemo && hrRecruitmentDemo && <span title={COMMON_TEXT.demoNote}><Badge tone="warn">{COMMON_TEXT.demoBadge}</Badge></span>}
      </div>
      <p className="zrv-hr-sub">{subtitle}</p>
      {showDemo && hrRecruitmentDemo && <p className="zrv-hr-sr">{COMMON_TEXT.demoNote}</p>}
    </header>
  )
}

// Frame shared by the three forms: header, flow, toolbar, ticket strip, step
// track, the stage that slides between steps and the live side column.
// `focusError` changes after a failed validation: the first invalid field of
// the (newly opened) step receives focus.
export function RecruitmentShell({
  current, title, subtitle, flowStatus, tools, primary, feedback, onDismissFeedback, lookupNotice, ticket, steps, step, onStep, doneSteps,
  finalLabel, onFinal, side, locked, pending, focusError, children,
}) {
  const [direction, setDirection] = useState({ step, value: 'fwd' })
  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const moved = useRef(false)
  if (direction.step !== step) setDirection({ step, value: step < direction.step ? 'back' : 'fwd' })

  const go = (target) => {
    const next = Math.max(0, Math.min(steps.length - 1, target))
    if (next === step) return
    moved.current = true
    onStep(next)
    requestAnimationFrame(() => trackRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  // Keyboard users land on the heading of the step they moved to.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    stageRef.current?.querySelector('.zrv-hr-panel h2')?.focus({ preventScroll: true })
  }, [step])

  useEffect(() => {
    if (!focusError) return
    const frame = requestAnimationFrame(() => {
      const invalid = stageRef.current?.querySelector('[aria-invalid="true"]')
      const target = invalid?.matches('input,select,textarea,button') ? invalid : invalid?.querySelector('input,select,textarea,button')
      target?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusError])

  return (
    <div className={`zrv-hr zrv-hr--${current}`}>
      <RecruitmentHeader title={title} subtitle={subtitle} showDemo={current !== 'requisition'} />
      <FlowNav current={current} status={flowStatus} />

      <div className="zrv-hr-toolbar" role="toolbar" aria-label={COMMON_TEXT.toolbarLabel}>
        <div className="zrv-hr-tools">
          {tools.map((tool) => (
            <button key={tool.label} type="button" onClick={tool.onClick} disabled={tool.disabled} title={tool.label}>
              <OrvexaIcon name={tool.icon} size={17} /><span>{tool.label}</span>
            </button>
          ))}
        </div>
        {primary && (
          <button type="button" className="btn-primary zrv-hr-btn" onClick={primary.onClick} disabled={locked || pending || primary.disabled}>
            <OrvexaIcon name={primary.icon || 'check'} size={16} /> {primary.label}
          </button>
        )}
      </div>

      <Feedback feedback={feedback} onDismiss={onDismissFeedback} />
      {lookupNotice}
      {ticket}

      <nav className="zrv-hr-track" aria-label={COMMON_TEXT.stepsLabel} style={{ '--step': step }} ref={trackRef}>
        <span className="zrv-hr-track__fill" aria-hidden="true" />
        {steps.map(([name, hint], index) => {
          const done = doneSteps[index] && index !== step
          return (
            <button key={name} type="button" className={`zrv-hr-track__step${done ? ' zrv-hr-is-done' : ''}`} aria-current={index === step ? 'step' : undefined} onClick={() => go(index)}>
              <span className="zrv-hr-track__n">{done ? <OrvexaIcon name="check" size={15} /> : index + 1}</span>
              <span className="zrv-hr-track__t"><b>{name}</b><small>{hint}</small></span>
            </button>
          )
        })}
      </nav>

      <div className="zrv-hr-body">
        <form className="zrv-hr-stage" noValidate onSubmit={(event) => event.preventDefault()} ref={stageRef}>
          {locked && <p className="zrv-hr-locked"><OrvexaIcon name="lock" size={15} /> {COMMON_TEXT.readOnly}</p>}
          <fieldset disabled={locked} className="zrv-hr-stage__fs">
            <section key={step} className={`zrv-hr-panel zrv-hr-is-entering zrv-hr-is-${direction.value}`}>
              {children}
            </section>
          </fieldset>
          <div className="zrv-hr-stage__nav">
            <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => go(step - 1)} disabled={step === 0}>
              <OrvexaIcon name="arrow-left" size={16} /> {COMMON_TEXT.back}
            </button>
            <span className="zrv-hr-dots" aria-hidden="true">{steps.map(([name], index) => <i key={name} className={index === step ? 'zrv-hr-is-on' : ''} />)}</span>
            {step < steps.length - 1 ? (
              <button type="button" className="btn-primary zrv-hr-btn" onClick={() => go(step + 1)}>{COMMON_TEXT.continue} <OrvexaIcon name="arrow-right" size={16} /></button>
            ) : (
              <button type="button" className="btn-primary zrv-hr-btn" onClick={onFinal} disabled={locked || pending}><OrvexaIcon name="check" size={16} /> {finalLabel}</button>
            )}
          </div>
        </form>
        <aside className="zrv-hr-side">{side}</aside>
      </div>
    </div>
  )
}

export function PanelHead({ n, eyebrow, title, desc }) {
  return (
    <div className="zrv-hr-panel__head">
      <div>
        <span className="zrv-hr-eyebrow">{eyebrow}</span>
        <h2 tabIndex={-1}>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      <span className="zrv-hr-panel__n" aria-hidden="true">{String(n).padStart(2, '0')}</span>
    </div>
  )
}

export function Ticket({ avatar, items, code }) {
  return (
    <section className="zrv-hr-ticket" aria-label={COMMON_TEXT.ticketLabel}>
      <span className="zrv-hr-avatar" aria-hidden="true">{avatar}</span>
      <dl className="zrv-hr-ticket__meta">
        {items.map((item) => (
          <div key={item.k}><dt>{item.k}</dt><dd className={item.big ? 'zrv-hr-is-big' : undefined}>{item.v}</dd></div>
        ))}
      </dl>
      <span className="zrv-hr-ticket__perf" aria-hidden="true" />
      <div className="zrv-hr-ticket__no"><span>{COMMON_TEXT.formCode}</span>{code}</div>
    </section>
  )
}

export function Pill({ tone = 'ok', children }) {
  return <span className={`zrv-hr-pill zrv-hr-is-${tone}`}>{children}</span>
}

// Completion ring.
export function Orbit({ done, total, hint }) {
  const circumference = 238.76
  const ratio = total ? done / total : 0
  const percent = Math.round(ratio * 100)
  return (
    <div className="zrv-hr-orbit zrv-hr-card">
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={COMMON_TEXT.percent(percent)}>
        <circle cx="46" cy="46" r="38" fill="none" className="zrv-hr-orbit__track" strokeWidth="8" />
        <circle className="zrv-hr-orbit__ring" cx="46" cy="46" r="38" fill="none" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={(circumference * (1 - ratio)).toFixed(2)} transform="rotate(-90 46 46)" />
        <text x="46" y="52" textAnchor="middle" className="zrv-hr-orbit__text">{percent}%</text>
      </svg>
      <div><b>{COMMON_TEXT.progress(done, total)}</b><small>{hint}</small></div>
    </div>
  )
}

export function RouteCard({ title, note, steps }) {
  return (
    <section className="zrv-hr-route zrv-hr-card" aria-label={title}>
      <h3>{title}</h3>
      {note && <p>{note}</p>}
      <ol>
        {steps.map((item, index) => (
          <li key={item.code} className={item.added ? 'zrv-hr-is-added' : undefined}>
            <span className="zrv-hr-route__n">{index + 1}</span>
            <span><b>{item.label}</b><small>{item.note}</small></span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Dark preview card that tilts towards the pointer (not with reduced motion).
export function Tilt({ className = '', children, ...rest }) {
  const ref = useRef(null)
  const onMove = (event) => {
    if (!window.matchMedia('(hover:hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const node = ref.current
    const box = node.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    node.style.setProperty('--ry', `${((x - 0.5) * 12).toFixed(2)}deg`)
    node.style.setProperty('--rx', `${((0.5 - y) * 10).toFixed(2)}deg`)
    node.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    node.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  }
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  return (
    <div className="zrv-hr-tilt-wrap">
      <article ref={ref} className={`zrv-hr-tilt zrv-hr-dark ${className}`.trim()} onPointerMove={onMove} onPointerLeave={onLeave} {...rest}>{children}</article>
    </div>
  )
}
