import type { ColumnMapping } from '../../lib/csv/pipeline'
import type { DateFormat } from '../../lib/csv/parseDate'

/**
 * Editable column mapping.
 *
 * The AI's guess is a starting point, not a verdict. Previously the mapping
 * was presented read-only and the only response to a wrong guess was to cancel
 * the whole import — so a single misidentified column made a file unimportable.
 */

const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY']

function Field({
  label, value, onChange, options, hint, allowNone = false,
}: {
  label: string
  value: string | null | undefined
  onChange: (v: string | null) => void
  options: string[]
  hint?: string
  allowNone?: boolean
}) {
  return (
    <label className="grid gap-1">
      <span className="micro text-muted">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-[38px] rounded-[8px] border border-[var(--hair)] bg-[var(--input-bg)] px-2 text-[13px] outline-none focus:border-accent"
      >
        {allowNone && <option value="">— none —</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {hint && <span className="text-[13px] text-ink2">{hint}</span>}
    </label>
  )
}

export default function MappingEditor({
  headers,
  mapping,
  onChange,
  dateFormatConfident,
  rememberProfile,
  onRememberChange,
  profileExisted,
  profileName,
}: {
  headers: string[]
  mapping: ColumnMapping
  onChange: (m: ColumnMapping) => void
  dateFormatConfident: boolean
  rememberProfile: boolean
  onRememberChange: (v: boolean) => void
  profileExisted: boolean
  profileName?: string
}) {
  const set = (patch: Partial<ColumnMapping>) => onChange({ ...mapping, ...patch })
  const usesSplit = Boolean(mapping.debitCol || mapping.creditCol)

  return (
    <div className="grid gap-4">
      {profileExisted && (
        <p className="rounded-[8px] border border-[var(--hair)] bg-black/[0.02] px-3 py-2 text-[12.5px] text-muted">
          Layout recognised{profileName ? <> from <strong>{profileName}</strong></> : ' from a saved profile'}
          {' '}— no AI call was needed for this file.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date column" value={mapping.dateCol} options={headers}
          onChange={(v) => set({ dateCol: v ?? '' })} />
        <Field label="Description column" value={mapping.descCol} options={headers}
          onChange={(v) => set({ descCol: v ?? '' })} />

        <label className="grid gap-1">
          <span className="micro text-muted">Date format</span>
          <select
            value={mapping.dateFormat ?? 'DD/MM/YYYY'}
            onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}
            className="min-h-[38px] rounded-[8px] border border-[var(--hair)] bg-[var(--input-bg)] px-2 text-[13px] outline-none focus:border-accent"
          >
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {!dateFormatConfident && (
            <span className="text-[13px] font-medium text-[var(--color-warn)]">
              Every date in this file is ambiguous (no day above 12). Assuming
              day-first — check this is right.
            </span>
          )}
        </label>

        <Field
          label="Amount column" value={mapping.amountCol} options={headers} allowNone
          onChange={(v) => set({ amountCol: v, debitCol: v ? null : mapping.debitCol, creditCol: v ? null : mapping.creditCol })}
          hint={usesSplit ? 'Not used — this file splits debit and credit' : undefined}
        />

        <Field label="Debit column" value={mapping.debitCol} options={headers} allowNone
          onChange={(v) => set({ debitCol: v, amountCol: v ? null : mapping.amountCol })} />
        <Field label="Credit column" value={mapping.creditCol} options={headers} allowNone
          onChange={(v) => set({ creditCol: v, amountCol: v ? null : mapping.amountCol })} />

        <Field label="Bank category column" value={mapping.categoryCol} options={headers} allowNone
          onChange={(v) => set({ categoryCol: v })}
          hint="Used first, before any AI — free and usually accurate" />
        <Field label="Bank subcategory column" value={mapping.subcategoryCol} options={headers} allowNone
          onChange={(v) => set({ subcategoryCol: v })} />
      </div>

      {!usesSplit && (
        <label className="flex min-h-11 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(mapping.invertAmount)}
            onChange={(e) => set({ invertAmount: e.target.checked })}
          />
          Expenses are positive numbers in this file
          <span className="text-[13px] text-ink2">(common on credit-card exports)</span>
        </label>
      )}

      <label className="flex min-h-11 items-center gap-2 text-[13px]">
        <input type="checkbox" checked={rememberProfile}
          onChange={(e) => onRememberChange(e.target.checked)} />
        {profileExisted ? 'Keep this saved layout updated' : 'Remember this layout'}
        <span className="text-[13px] text-ink2">
          {profileExisted
            ? '— any column changes above replace the saved version'
            : '— future uploads from this bank skip the AI mapping entirely'}
        </span>
      </label>
    </div>
  )
}
