import { motion } from 'framer-motion'
import Tile from './Tile'

/** Period KPI card — micro-label, big value (re-keys for a soft fade when the
 *  filters change it) + an optional coloured delta line. `tone` sets the
 *  sub-line colour (pos = green, neg = red, muted = grey); the arrow glyph lives
 *  in the `sub` string so each caller owns its up/down semantics (spending up is
 *  unfavourable, income up is favourable). Pass `valueClass="truncate"` for
 *  text values (category / vendor names) so long names ellipsize. */
export default function HeroMetric({
  label,
  value,
  sub,
  tone = 'muted',
  valueClass = '',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'pos' | 'neg' | 'muted'
  valueClass?: string
}) {
  const subColor = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-muted'
  return (
    <Tile className="flex flex-col">
      <div className="micro text-muted">{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`mt-2 text-[28px] font-bold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </motion.div>
      {sub && <div className={`mt-1.5 text-[12px] font-semibold ${subColor}`}>{sub}</div>}
    </Tile>
  )
}
