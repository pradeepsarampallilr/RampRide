import { useState } from 'react';

export default function PinPad({ length = 4, onSubmit, error, disabled, hint }) {
  const [digits, setDigits] = useState('');

  function pressDigit(d) {
    if (disabled) return;
    setDigits((prev) => (prev.length >= length ? prev : prev + d));
  }

  function backspace() {
    if (disabled) return;
    setDigits((prev) => prev.slice(0, -1));
  }

  function clear() {
    setDigits('');
  }

  function submit() {
    if (disabled || digits.length !== length) return;
    onSubmit?.(digits);
    setDigits('');
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`flex h-12 w-10 items-center justify-center rounded-lg border text-xl font-semibold ${
              i < digits.length
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white'
            }`}
          >
            {digits[i] ? '•' : ''}
          </div>
        ))}
      </div>

      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : null}

      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => {
          if (k === 'clear') {
            return (
              <button
                key={k}
                type="button"
                onClick={clear}
                disabled={disabled}
                className="h-16 w-16 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 active:bg-slate-200 disabled:opacity-50"
              >
                Clear
              </button>
            );
          }
          if (k === 'back') {
            return (
              <button
                key={k}
                type="button"
                onClick={backspace}
                disabled={disabled}
                className="h-16 w-16 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 active:bg-slate-200 disabled:opacity-50"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              onClick={() => pressDigit(k)}
              disabled={disabled}
              className="h-16 w-16 rounded-xl bg-white text-2xl font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-50"
            >
              {k}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={disabled || digits.length !== length}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:bg-slate-300"
      >
        Verify
      </button>
    </div>
  );
}
