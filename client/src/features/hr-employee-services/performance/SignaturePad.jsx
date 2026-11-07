import { useEffect, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'

// A real signature pad: the signer draws with the mouse, a pen or a finger and
// the stroke is stored as a PNG data URL. Nothing is "simulated" — an empty pad
// stays empty until the person signs.
const WIDTH = 640
const HEIGHT = 180

export default function SignaturePad({ id, label, hint, clearLabel, value, onChange, disabled }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [touched, setTouched] = useState(false)
  const [redrawing, setRedrawing] = useState(false)
  const hasImage = typeof value === 'string' && value.startsWith('data:image')
  const showCanvas = !hasImage || redrawing

  useEffect(() => {
    if (!showCanvas) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const context = canvas.getContext('2d')
    context.lineWidth = 2.4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#0b3d2c'
    context.clearRect(0, 0, WIDTH, HEIGHT)
    setTouched(false)
  }, [showCanvas])

  const pointOf = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * WIDTH) / rect.width,
      y: ((event.clientY - rect.top) * HEIGHT) / rect.height,
    }
  }
  const start = (event) => {
    if (disabled || !showCanvas) return
    event.preventDefault()
    canvasRef.current.setPointerCapture?.(event.pointerId)
    drawing.current = true
    last.current = pointOf(event)
    const context = canvasRef.current.getContext('2d')
    context.beginPath()
    context.moveTo(last.current.x, last.current.y)
    setTouched(true)
  }
  const move = (event) => {
    if (!drawing.current) return
    event.preventDefault()
    const point = pointOf(event)
    const context = canvasRef.current.getContext('2d')
    context.lineTo(point.x, point.y)
    context.stroke()
    last.current = point
  }
  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange?.(canvasRef.current.toDataURL('image/png'))
    setRedrawing(false)
  }
  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT)
    setTouched(false)
    onChange?.(null)
    setRedrawing(true)
  }

  return (
    <div className={`zrv-hr-sign__pad zrv-hr-es-pad${disabled ? ' zrv-hr-is-locked' : ''}${hasImage && !redrawing ? ' zrv-hr-is-signed' : ''}`}>
      {showCanvas ? (
        <canvas id={id} ref={canvasRef} className="zrv-hr-es-pad__canvas" role="img" aria-label={label}
          onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish} />
      ) : (
        <img id={id} className="zrv-hr-es-pad__img" src={value} alt={label} />
      )}
      {showCanvas && !touched && !disabled && <span className="zrv-hr-es-pad__hint" aria-hidden="true">{hint}</span>}
      {!disabled && (
        <button type="button" className="zrv-hr-es-pad__clear" onClick={clear} disabled={(showCanvas && !touched && !hasImage)}>
          <OrvexaIcon name="eraser" size={14} /> {clearLabel}
        </button>
      )}
    </div>
  )
}
