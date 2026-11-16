import toast from 'react-hot-toast';

/**
 * "Done · Undo" toast. Faster and friendlier than an "Are you sure?" dialog for reversible actions.
 * The countdown bar shows how long Undo stays available.
 */
export function undoToast(message, onUndo, { label = 'Undo', ms = 6000 } = {}) {
  return toast.custom((t) => (
    <div className={`${t.visible ? 'modal-in' : 'opacity-0 transition-opacity'} relative flex min-w-[260px] max-w-sm items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface py-3 ps-4 pe-3 text-sm font-semibold text-ink shadow-pop`} role="status">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => { toast.dismiss(t.id); onUndo(); }} className="rounded-lg bg-brand/30 px-3 py-1.5 text-xs font-extrabold text-forest transition hover:bg-brand/50">{label}</button>
      <span className="undo-bar absolute inset-x-0 bottom-0 h-0.5 bg-brand-deep" style={{ animationDuration: `${ms}ms` }} aria-hidden="true" />
    </div>
  ), { duration: ms });
}
