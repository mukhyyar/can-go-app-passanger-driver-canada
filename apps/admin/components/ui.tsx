'use client';

export function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'action';
}) {
  return <span className={`chip ${tone === 'default' ? '' : tone}`}>{children}</span>;
}

export function statusTone(s?: string) {
  const v = (s ?? '').toUpperCase();
  if (/(COMPLET|APPROV|ACTIVE|SUCCEED|ONLINE|VISIBLE|RESOLVED|UP)/.test(v)) return 'ok' as const;
  if (/(PEND|WAIT|BOOK|REVIEW|DRAFT)/.test(v)) return 'warn' as const;
  if (/(CANCEL|FAIL|REJECT|SUSPEND|CRIT|HIDDEN|DOWN)/.test(v)) return 'bad' as const;
  return 'info' as const;
}

export function money(n?: number, c = 'USD') {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(n);
}

export function when(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-back"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 id="modal-title" style={{ margin: 0 }}>
            {title}
          </h3>
          <button className="btn ghost sm" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="muted">{text}</p>;
}
