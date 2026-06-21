import { useEffect, useRef } from 'react'
import type { View } from '../router'

/**
 * Halcyon ambient scene — a Halo Reach–style diamond lattice (architecture)
 * with a slow, sparse drifting node network on top, an occasional mint pulse
 * that sweeps the diamonds, and cursor interaction. Pure 2D canvas; the colour
 * wash lives behind it as CSS (`.scene-wash`).
 */

const INK = '20,24,28'
const MINT = '17,181,150'

// per-view parallax nudge (subtle) + grid phase offset
const VIEW_SHIFT: Record<View, number> = {
  landing: 0,
  dashboard: 18,
  accounts: -22,
  income: -10,
  expenses: 24,
  ingestion: -8,
  settings: 12,
}

interface Node {
  x: number
  y: number
  vx: number
  vy: number
}

export default function SceneBackground({
  view,
  motionOn = true,
  dark = false,
}: {
  view: View
  motionOn?: boolean
  dark?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ setView: (v: View) => void; setMotion: (on: boolean) => void; setDark: (d: boolean) => void } | null>(null)

  useEffect(() => {
    if (api.current) return
    const cv = canvasRef.current!
    const ctx = cv.getContext('2d')!
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const GAP = 56 // diamond size
    let nodes: Node[] = []
    const seedNodes = () => {
      const count = Math.max(25, Math.min(60, Math.round((W * H) / 42000))) // -- Change this value for density
      nodes = []
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.075, // slow drift
          vy: (Math.random() - 0.5) * 0.075,
        })
      }
    }
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = window.innerWidth
      H = window.innerHeight
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!nodes.length) seedNodes()
    }
    resize()
    seedNodes()

    const m = { x: -999, y: -999, active: false }
    const onMove = (e: MouseEvent) => {
      m.x = e.clientX
      m.y = e.clientY
      m.active = true
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', resize)

    let t = 0
    let motion = motionOn
    let isDark = dark
    let raf = 0
    let parX = 0, parTargetX = 0
    let phase = 0, phaseTarget = 0
    // occasional pulse that sweeps the diamonds
    let pulse: { pos: number; dir: 1 | -1 } | null = null
    let nextPulse = 4

    const linkD = 130
    const linkD2 = linkD * linkD

    const draw = () => {
      raf = requestAnimationFrame(draw)
      ctx.clearRect(0, 0, W, H)
      if (motion) t += 0.0045

      parX += (parTargetX - parX) * 0.04
      phase += (phaseTarget - phase) * 0.04
      const ox = parX + (m.active ? (m.x / W - 0.5) * 14 : 0)
      const oy = m.active ? (m.y / H - 0.5) * 10 : 0

      ctx.save()
      ctx.translate(ox, oy)

      // ---- diamond lattice (two diagonal line sets) with faint shimmer ----
      const L = isDark ? '226,233,240' : INK
      const baseA = isDark ? 0.08 : 0.045
      const amp = isDark ? 0.04 : 0.025
      const linkA = isDark ? 0.22 : 0.15
      const nodeA = isDark ? 0.62 : 0.5
      const shimmer = (c: number) => baseA + Math.max(0, Math.sin(c * 0.01 - t + phase)) * amp
      for (let c = -H - 60; c < W + 60; c += GAP) {
        ctx.strokeStyle = `rgba(${L},${shimmer(c)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(c, -30)
        ctx.lineTo(c + H + 60, H + 30)
        ctx.stroke()
      }
      for (let c = -60; c < W + H + 60; c += GAP) {
        let a = shimmer(c)
        // mint pulse highlight on the "/" set
        if (pulse) {
          const dist = Math.abs(c - pulse.pos)
          if (dist < GAP * 2.4) {
            const mintA = (1 - dist / (GAP * 2.4)) * 0.55
            ctx.strokeStyle = `rgba(${MINT},${mintA})`
            ctx.lineWidth = 1.4
            ctx.beginPath()
            ctx.moveTo(c, -30)
            ctx.lineTo(c - H - 60, H + 30)
            ctx.stroke()
          }
        }
        ctx.strokeStyle = `rgba(${L},${a})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(c, -30)
        ctx.lineTo(c - H - 60, H + 30)
        ctx.stroke()
      }

      // ---- drifting node network ----
      if (motion) {
        for (const n of nodes) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < 0 || n.x > W) n.vx *= -1
          if (n.y < 0 || n.y > H) n.vy *= -1
          if (m.active) {
            const dx = m.x - ox - n.x, dy = m.y - oy - n.y
            const d2 = dx * dx + dy * dy
            if (d2 < 8000) {
              n.vx += dx * 0.00003
              n.vy += dy * 0.00003
            }
          }
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkD2) {
            const d = Math.sqrt(d2)
            ctx.strokeStyle = `rgba(${L},${linkA * (1 - d / linkD)})`
            ctx.lineWidth = 1.25 // -- Change this value for node connection thickness
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }
      const mwx = m.x - ox, mwy = m.y - oy
      for (const n of nodes) {
        const near = m.active && Math.hypot(n.x - mwx, n.y - mwy) < 90
        ctx.fillStyle = near ? `rgba(${MINT},0.95)` : `rgba(${L},${nodeA})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, 2, 0, 7) // Change these values for larger dots
        ctx.fill()
      }

      ctx.restore()

      // ---- advance the occasional pulse ----
      if (motion) {
        if (!pulse && t > nextPulse) {
          pulse = { pos: -60, dir: 1 }
          nextPulse = t + 9 + Math.random() * 7 // every ~9–16s
        }
        if (pulse) {
          pulse.pos += 5.5
          if (pulse.pos > W + H + 120) pulse = null
        }
      }
    }
    draw()

    api.current = {
      setView: (v) => {
        parTargetX = VIEW_SHIFT[v] ?? 0
        phaseTarget = (VIEW_SHIFT[v] ?? 0) * 0.04
      },
      setMotion: (on) => {
        motion = on
      },
      setDark: (d) => {
        isDark = d
      },
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', resize)
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    api.current?.setView(view)
  }, [view])
  useEffect(() => {
    api.current?.setMotion(motionOn)
  }, [motionOn])
  useEffect(() => {
    api.current?.setDark(dark)
  }, [dark])

  return (
    <>
      <div className="scene-wash" aria-hidden />
      <canvas ref={canvasRef} className="fixed inset-0" style={{ width: '100vw', height: '100vh', zIndex: 0 }} />
    </>
  )
}
