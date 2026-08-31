// tone per CONTRACTS §13: brand|savings|alert|night
const TONE_CLASSES = {
  brand: 'bg-indigo-50 text-indigo-600',
  savings: 'bg-emerald-50 text-emerald-600',
  alert: 'bg-amber-50 text-amber-600',
  night: 'bg-violet-50 text-violet-900',
};

export default function StatCard({ label, value, sub, icon: Icon, tone = 'brand' }) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.brand;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        {Icon ? (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
