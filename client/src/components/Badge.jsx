// tone per CONTRACTS §13/§9: female|male|escort|night|planned|assigned|progress|completed|reordered
const TONE_CLASSES = {
  female: 'bg-pink-50 text-pink-600 ring-pink-200',
  male: 'bg-sky-50 text-sky-600 ring-sky-200',
  escort: 'bg-rose-50 text-rose-600 ring-rose-200',
  night: 'bg-violet-50 text-violet-900 ring-violet-200',
  planned: 'bg-slate-100 text-slate-600 ring-slate-200',
  assigned: 'bg-indigo-50 text-indigo-600 ring-indigo-200',
  progress: 'bg-amber-50 text-amber-600 ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  reordered: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export default function Badge({ tone = 'planned', children }) {
  const classes = TONE_CLASSES[tone] || TONE_CLASSES.planned;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {children}
    </span>
  );
}
