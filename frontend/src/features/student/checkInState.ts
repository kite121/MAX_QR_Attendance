import type { ApiErrorCode, CheckInContextStatus } from '../../shared/api/types';

export interface CheckInStateCopy {
  tone: 'success' | 'warning' | 'error' | 'neutral';
  icon: string;
  title: string;
  description: string;
}

const contextCopy: Record<
  Exclude<CheckInContextStatus, 'available'>,
  CheckInStateCopy
> = {
  expired: {
    tone: 'warning',
    icon: '⌛',
    title: 'QR-код уже обновился',
    description: 'Отсканируйте новый код на экране преподавателя.',
  },
  session_closed: {
    tone: 'neutral',
    icon: '■',
    title: 'Занятие завершено',
    description: 'Преподаватель уже закрыл сбор посещаемости.',
  },
  not_enrolled: {
    tone: 'error',
    icon: '!',
    title: 'Вы не состоите в группе',
    description: 'Проверьте аккаунт или обратитесь к преподавателю.',
  },
  already_checked_in: {
    tone: 'success',
    icon: '✓',
    title: 'Вы уже отметились',
    description: 'Повторно отправлять отметку не нужно.',
  },
};

export function getContextStateCopy(
  status: Exclude<CheckInContextStatus, 'available'>,
): CheckInStateCopy {
  return contextCopy[status];
}

export function getErrorStateCopy(code?: ApiErrorCode): CheckInStateCopy {
  if (code === 'QR_TOKEN_EXPIRED' || code === 'QR_TOKEN_INVALID')
    return contextCopy.expired;
  if (code === 'SESSION_CLOSED') return contextCopy.session_closed;
  if (code === 'STUDENT_NOT_ENROLLED') return contextCopy.not_enrolled;
  if (code === 'ALREADY_CHECKED_IN') return contextCopy.already_checked_in;
  return {
    tone: 'error',
    icon: '↻',
    title: 'Не удалось отметиться',
    description: 'Проверьте соединение и попробуйте ещё раз.',
  };
}
