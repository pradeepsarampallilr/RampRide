export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      {Icon ? <Icon className="mb-1 h-8 w-8 text-slate-400" /> : null}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {body ? <p className="max-w-sm text-sm text-slate-500">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
