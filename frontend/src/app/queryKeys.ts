export const queryKeys = {
  groups: ['groups'] as const,
  groupStudents: (groupId: string) => ['groups', groupId, 'students'] as const,
  activeSession: (groupId: string) => ['groups', groupId, 'sessions', 'active'] as const,
  sessions: (groupId: string) => ['groups', groupId, 'sessions'] as const,
  session: (sessionId: string) => ['sessions', sessionId] as const,
  qrToken: (sessionId: string) => ['sessions', sessionId, 'qr-token'] as const,
  checkIns: (sessionId: string) => ['sessions', sessionId, 'check-ins'] as const,
  checkInContext: (token: string) => ['check-in-context', token] as const,
};
