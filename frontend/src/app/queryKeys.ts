export const queryKeys = {
  groups: ['groups'] as const,
  session: (sessionId: string) => ['sessions', sessionId] as const,
  qrToken: (sessionId: string) => ['sessions', sessionId, 'qr-token'] as const,
  checkIns: (sessionId: string) => ['sessions', sessionId, 'check-ins'] as const,
  checkInContext: (token: string) => ['check-in-context', token] as const,
};
