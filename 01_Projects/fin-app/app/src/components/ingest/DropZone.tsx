import { useRef, useState } from 'react'

/**
 * Drag-and-drop file input.
 *
 * Both previous ingestion screens displayed "Drop CSV file here" over a plain
 * hidden `<input type="file">` with no drop handlers at all — the affordance
 * was advertised and did nothing. This makes it true.
 */
export default function DropZone({
  onFile,
  disabled,
  accept = '.csv,text/csv',
}: {
  onFile: (file: File) => void
  disabled?: boolean
  accept?: string
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (file: File | undefined) => {
    if (!file || disabled) return
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') return
    onFile(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handle(e.dataTransfer.files?.[0])
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload a CSV file"
      aria-disabled={disabled}
      className={`grid cursor-pointer place-items-center rounded-[12px] border-2 border-dashed px-6 py-10 text-center transition ${
        dragging
          ? 'border-accent bg-[var(--accent-wash)]'
          : 'border-[var(--hair)] hover:border-accent hover:bg-black/[0.02]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }}
      />
      <div className="grid gap-1">
        <p className="text-[14px] font-medium">
          {dragging ? 'Release to upload' : 'Drop a CSV here'}
        </p>
        <p className="text-[12.5px] text-muted">or click to browse</p>
      </div>
    </div>
  )
}
