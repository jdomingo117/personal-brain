import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const base =
    'micro min-h-11 rounded-lg px-5 py-3 transition will-change-transform'
  const styles =
    variant === 'primary'
      ? 'bg-ink text-surface hover:-translate-y-px hover:shadow-lg'
      : 'border border-[var(--hair)] text-ink hover:bg-black/[0.03]'
  return (
    <motion.button type={type} disabled={disabled} onClick={onClick} whileTap={disabled ? undefined : { scale: 0.97 }} className={`${base} ${styles} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {children}
    </motion.button>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[10px] border px-3.5 py-2 text-[12px] font-medium transition ${
        active
          ? 'border-accent bg-[var(--accent-wash)] text-accent-ink'
          : 'border-[var(--hair)] text-ink2 hover:border-[var(--hair)] hover:bg-black/[0.02]'
      }`}
    >
      {children}
    </button>
  )
}

/** Dismissible chip for an applied filter — label + ✕, mint accent to read as
 *  active state. */
export function RemovableChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[9px] border border-accent bg-[var(--accent-wash)] py-1 pl-2.5 pr-1 text-[12px] font-medium text-accent-ink">
      {children}
      <button
        type="button"
        aria-label="Remove filter"
        onClick={onRemove}
        className="grid h-[18px] w-[18px] place-items-center rounded-full text-accent-ink transition hover:opacity-60"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}

/** Styled native select — `var(--input-bg)` fill, hairline border, accent
 *  focus ring (design system §8.9). Options inherit OS theming on open. */
export function Select({
  value,
  onChange,
  children,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] py-2.5 pl-3.5 pr-9 text-[13px] font-medium text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
      >
        {children}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}

/** Styled native date input — matches `Select` chrome. The native calendar
 *  popup + picker glyph follow the theme via `color-scheme` (set in index.css
 *  under `.dark`). */
export function DateInput({
  value,
  onChange,
  min,
  max,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className={`cursor-pointer rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)] ${className}`}
    />
  )
}

/** Text search field — shared input chrome with a leading magnifier glyph and a
 *  trailing clear (✕) that appears once there's a value. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] py-2.5 pl-9 pr-8 text-[13px] font-medium text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-[var(--hair-soft)] hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

/** Numeric `$` field for amount bounds. Empty string = unbounded; emits a
 *  cleaned string (digits + at most one dot) so the caller owns parsing. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] py-2.5 pl-7 pr-3 text-[13px] font-medium tabular-nums text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
      />
    </div>
  )
}

export interface MultiOption {
  value: string
  label: string
  hint?: string
}

/** Checkbox dropdown multi-select with Select all / Clear. Trigger mirrors the
 *  `Select` chrome; the panel is an opaque frosted popover (`--toast-bg`) that
 *  closes on outside-click or Escape. Elevate the host container's z-index so
 *  the panel paints above following tiles. */
export function MultiSelect({
  options,
  selected,
  onChange,
  ariaLabel,
  allLabel = 'All selected',
  emptyLabel = 'None selected',
  noun = 'selected',
}: {
  options: MultiOption[]
  selected: string[]
  onChange: (next: string[]) => void
  ariaLabel?: string
  allLabel?: string
  emptyLabel?: string
  noun?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const all = options.length > 0 && selected.length === options.length
  const none = selected.length === 0
  const label = none
    ? emptyLabel
    : all
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `1 ${noun}`
        : `${selected.length} ${noun}`

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] py-2.5 pl-3.5 pr-3 text-[13px] font-medium text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
      >
        <span className="truncate">{label}</span>
        <svg
          aria-hidden
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0 text-muted transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            role="listbox"
            aria-multiselectable
            className="absolute left-0 right-0 z-50 mt-1.5 rounded-[12px] border border-[var(--hair)] p-1.5"
            style={{
              background: 'var(--toast-bg)',
              backdropFilter: 'blur(22px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
              boxShadow: 'var(--shadow-glass)',
            }}
          >
            <div className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="micro text-muted">{selected.length}/{options.length} selected</span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => onChange(options.map((o) => o.value))}
                  disabled={all}
                  className="rounded-[6px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-accent-ink transition hover:bg-[var(--accent-wash)] disabled:pointer-events-none disabled:text-faint"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  disabled={none}
                  className="rounded-[6px] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink2 transition hover:bg-[var(--hair-soft)] disabled:pointer-events-none disabled:text-faint"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="mx-1 my-1 border-t border-[var(--hair-soft)]" />
            <ul className="max-h-[230px] overflow-auto">
              {options.map((o) => {
                const on = selected.includes(o.value)
                return (
                  <li key={o.value} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => toggle(o.value)}
                      className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left transition hover:bg-[var(--hair-soft)]"
                    >
                      <span
                        className={`grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-[5px] border transition ${
                          on ? 'border-accent bg-accent text-surface' : 'border-[var(--hair)]'
                        }`}
                      >
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{o.label}</span>
                      {o.hint && <span className="flex-shrink-0 text-[11px] tabular-nums text-muted">{o.hint}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Visible quick-range segmented control — a compact pill row with a sliding
 *  accent thumb (shared `layoutId`, like `SegmentedTabs`). Unlike the tabs it
 *  tolerates a `null` active id: when a custom range is in effect no thumb is
 *  drawn and nothing reads as selected. This is the primary "quick select"; the
 *  `DateRangePicker` beside it is the custom-range escape hatch. */
export function SegmentedRange({
  options,
  active,
  onSelect,
  ariaLabel,
  layoutId = 'range-thumb',
  className = '',
}: {
  options: { id: string; label: string; title?: string }[]
  active: string | null
  onSelect: (id: string) => void
  ariaLabel?: string
  layoutId?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex w-max items-center gap-0.5 rounded-[12px] border border-[var(--hair)] bg-[var(--glass-fill)] p-1 ${className}`}
    >
      {options.map((o) => {
        const isActive = o.id === active
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={isActive}
            title={o.title}
            onClick={() => onSelect(o.id)}
            className={`relative whitespace-nowrap rounded-[9px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
              isActive ? 'text-accent-ink' : 'text-ink2 hover:text-ink'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[9px] border border-accent bg-[var(--accent-wash)]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Compact date-range picker — a single trigger (range label + calendar glyph)
 *  opening a frosted popover with two `DateInput`s, plus optional `Chip`
 *  presets. Mirrors `MultiSelect` chrome/close behaviour. Designed to live in a
 *  header toolbar; elevate the host's z-index so the panel overlays following
 *  content. Pass `active` to accent the trigger when a custom range is set. */
export function DateRangePicker({
  from,
  to,
  min,
  max,
  presets,
  activePreset,
  onPreset,
  onFrom,
  onTo,
  active = false,
  ariaLabel,
  className = '',
}: {
  from: string
  to: string
  min?: string
  max?: string
  presets?: { id: string; label: string }[]
  activePreset?: string | null
  onPreset?: (id: string) => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
  active?: boolean
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const crossYear = new Date(`${from}T00:00:00`).getFullYear() !== new Date(`${to}T00:00:00`).getFullYear()
  const fmtDay = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(crossYear ? { year: '2-digit' } : {}),
    })
  const label = `${fmtDay(from)} – ${fmtDay(to)}`

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-[10px] border bg-[var(--input-bg)] py-2.5 pl-3.5 pr-3 text-[13px] font-medium outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)] ${
          active ? 'border-accent text-accent-ink' : 'border-[var(--hair)] text-ink'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <svg className={`flex-shrink-0 ${active ? 'text-accent' : 'text-muted'}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          <span className="truncate tabular-nums">{label}</span>
        </span>
        <svg
          aria-hidden
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className="flex-shrink-0 text-muted transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            role="dialog"
            aria-label="Select date range"
            className="absolute right-0 z-50 mt-1.5 w-[320px] rounded-[12px] border border-[var(--hair)] p-3"
            style={{
              background: 'var(--toast-bg)',
              backdropFilter: 'blur(22px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
              boxShadow: 'var(--shadow-glass)',
            }}
          >
            {presets && presets.length > 0 && (
              <>
                <div className="micro mb-2 text-muted">Quick range</div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <Chip key={p.id} active={activePreset === p.id} onClick={() => onPreset?.(p.id)}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
                <div className="my-3 border-t border-[var(--hair-soft)]" />
              </>
            )}
            <div className="micro mb-2 text-muted">Custom range</div>
            <div className="flex items-end gap-2">
              <label className="grid flex-1 gap-1.5">
                <span className="micro text-muted">From</span>
                <DateInput value={from} onChange={onFrom} min={min} max={to} ariaLabel="Range start date" className="w-full" />
              </label>
              <span className="pb-2.5 text-[13px] text-muted">→</span>
              <label className="grid flex-1 gap-1.5">
                <span className="micro text-muted">To</span>
                <DateInput value={to} onChange={onTo} min={from} max={max} ariaLabel="Range end date" className="w-full" />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between py-3"
    >
      <span className="text-[13px] font-medium text-ink2">{label}</span>
      <span
        className="relative h-[26px] w-[46px] rounded-full transition-colors"
        style={{ background: on ? 'var(--color-ink)' : 'var(--switch-off)' }}
      >
        <motion.span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-surface shadow"
          animate={{ left: on ? 23 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  )
}
