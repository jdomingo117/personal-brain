import { SegmentedRange, MultiSelect, DateRangePicker, type MultiOption } from './Controls'
import { PRESETS, MIN_DATE, MAX_DATE } from '../lib/period'

/** The analyzer filter bar: quick-range pills (left) · account multi-select +
 *  custom-range picker (right). Shared by the Income and Expenses analyzers so
 *  both stay pixel-identical; only the account options differ per view. Meant to
 *  sit as the second tier of a view header — keep the host's z-index elevated so
 *  the popovers overlay the content below. */
export default function AnalyzerFilters({
  preset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
  accounts,
  accountOptions,
  onAccounts,
  accountsAllLabel = 'All linked accounts',
  rangeLayoutId,
}: {
  preset: string | null
  from: string
  to: string
  onPreset: (id: string) => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
  accounts: string[]
  accountOptions: MultiOption[]
  onAccounts: (next: string[]) => void
  accountsAllLabel?: string
  /** Unique per host view — the router co-mounts views during transitions, so a
   *  shared layoutId would make the pill thumb animate across views. */
  rangeLayoutId?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
      <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
        <SegmentedRange
          options={PRESETS.map(({ id, label, title }) => ({ id, label, title }))}
          active={preset}
          onSelect={onPreset}
          ariaLabel="Quick date range"
          {...(rangeLayoutId ? { layoutId: rangeLayoutId } : {})}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="w-[200px]">
          <MultiSelect
            options={accountOptions}
            selected={accounts}
            onChange={onAccounts}
            ariaLabel="Linked financial accounts"
            allLabel={accountsAllLabel}
            emptyLabel="No accounts"
            noun="accounts"
          />
        </div>
        <DateRangePicker
          from={from}
          to={to}
          min={MIN_DATE}
          max={MAX_DATE}
          active={preset === null}
          onFrom={onFrom}
          onTo={onTo}
          ariaLabel="Custom date range"
          className="w-[188px]"
        />
      </div>
    </div>
  )
}
