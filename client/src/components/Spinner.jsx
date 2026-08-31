export default function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-slate-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}
