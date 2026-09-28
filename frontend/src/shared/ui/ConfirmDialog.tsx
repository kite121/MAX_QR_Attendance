import { Button } from '@maxhub/max-ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__icon" aria-hidden="true">
          ✓
        </div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div className="confirm-dialog__actions">
          <Button size="large" variant="secondary" onClick={onCancel} disabled={pending}>
            Отмена
          </Button>
          <Button size="large" variant="primary" onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
