import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SignatureMethod } from '@/types'

interface SignaturePadProps {
  /** Called with the PNG data URL + how it was drawn, or (null) when cleared. */
  onChange: (png: string | null, method: SignatureMethod | null) => void
  height?: number
}

function pointerMethod(type: string): SignatureMethod {
  if (type === 'touch') return 'touch'
  if (type === 'pen') return 'pen'
  return 'mouse'
}

export function SignaturePad({ onChange, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const method = useRef<SignatureMethod | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Size the backing store to the displayed size × DPR for crisp strokes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#1a1a1a'
    }
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    if (!method.current) method.current = pointerMethod(e.pointerType)
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    dirty.current = true
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas || !dirty.current) return
    setHasInk(true)
    onChange(canvas.toDataURL('image/png'), method.current)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    dirty.current = false
    method.current = null
    setHasInk(false)
    onChange(null, null)
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: 'none' }}
        className="w-full rounded-md border border-input bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Sign above with finger, stylus, or mouse.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={!hasInk}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}
