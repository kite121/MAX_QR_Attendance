import { Button, Spinner } from '@maxhub/max-ui';
import type { ReactNode } from 'react';

interface StateViewProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateView({
  icon,
  title,
  description,
  loading = false,
  actionLabel,
  onAction,
}: StateViewProps) {
  return (
    <section className="state-view" aria-live="polite">
      <div className="state-view__icon" aria-hidden="true">
        {loading ? <Spinner size={32} /> : icon}
      </div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actionLabel && onAction ? (
        <Button size="large" variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}
