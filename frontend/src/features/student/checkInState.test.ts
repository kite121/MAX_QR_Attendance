import { describe, expect, it } from 'vitest';

import { getContextStateCopy, getErrorStateCopy } from './checkInState';

describe('student check-in states', () => {
  it('treats a repeated check-in as a successful state', () => {
    expect(getContextStateCopy('already_checked_in')).toMatchObject({
      tone: 'success',
      title: 'Вы уже отметились',
    });
    expect(getErrorStateCopy('ALREADY_CHECKED_IN').tone).toBe('success');
  });

  it('shows a dedicated expired QR state', () => {
    expect(getErrorStateCopy('QR_TOKEN_EXPIRED')).toMatchObject({
      tone: 'warning',
      title: 'QR-код уже обновился',
    });
  });

  it('falls back to a retryable connection error', () => {
    expect(getErrorStateCopy()).toMatchObject({
      tone: 'error',
      title: 'Не удалось отметиться',
    });
  });
});
