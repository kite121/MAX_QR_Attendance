import { env } from '../../config/env';
import { request, requestBlob, requestFormData } from './httpClient';
import { mockApi } from './mockApi';
import type {
  AttendanceSession,
  AuditResponse,
  AuthResponse,
  CheckInContext,
  CheckInResult,
  CheckInsResponse,
  EnrollStudentInput,
  GroupStats,
  GroupsResponse,
  ImportStudentsResult,
  ManualCorrectionInput,
  QrTokenResponse,
  SessionsResponse,
  StudentsResponse,
} from './types';

export const api = {
  authMax(initData: string): Promise<AuthResponse> {
    if (env.useMockApi) return mockApi.authMax();
    return request<AuthResponse>('/auth/max', {
      method: 'POST',
      body: { init_data: initData },
    });
  },

  authMock(login: string, password: string): Promise<AuthResponse> {
    if (env.useMockApi) return mockApi.authMock(login, password);
    return request<AuthResponse>('/auth/mock', {
      method: 'POST',
      body: { login, password },
    });
  },

  getGroups(accessToken: string, signal?: AbortSignal): Promise<GroupsResponse> {
    if (env.useMockApi) return mockApi.getGroups(accessToken);
    return request<GroupsResponse>('/groups', { accessToken, signal });
  },

  getGroupStudents(
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ): Promise<StudentsResponse> {
    if (env.useMockApi) return mockApi.getGroupStudents(accessToken, groupId);
    return request<StudentsResponse>(`/groups/${groupId}/students`, {
      accessToken,
      signal,
    });
  },

  enrollStudent(
    accessToken: string,
    groupId: string,
    input: EnrollStudentInput,
  ): Promise<ImportStudentsResult> {
    if (env.useMockApi) return mockApi.enrollStudent(accessToken, groupId, input);
    const csv = `max_user_id,display_name\n${input.max_user_id},"${input.display_name.replaceAll('"', '""')}"`;
    return this.importStudentsCsv(
      accessToken,
      groupId,
      new File([csv], 'students.csv', { type: 'text/csv;charset=utf-8' }),
    );
  },

  importStudentsCsv(
    accessToken: string,
    groupId: string,
    file: File,
  ): Promise<ImportStudentsResult> {
    if (env.useMockApi) return mockApi.importStudentsCsv(accessToken, groupId, file);
    const form = new FormData();
    form.append('file', file);
    return requestFormData<ImportStudentsResult>(
      `/groups/${groupId}/enrollments/import`,
      form,
      { accessToken },
    );
  },

  getGroupStats(
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ): Promise<GroupStats> {
    if (env.useMockApi) return mockApi.getGroupStats(accessToken, groupId);
    return request<GroupStats>(`/groups/${groupId}/stats`, { accessToken, signal });
  },

  getGroupAudit(
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ): Promise<AuditResponse> {
    if (env.useMockApi) return mockApi.getGroupAudit(accessToken, groupId);
    return request<AuditResponse>(`/groups/${groupId}/audit`, { accessToken, signal });
  },

  getSessionAudit(
    accessToken: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AuditResponse> {
    if (env.useMockApi) return mockApi.getSessionAudit(accessToken, sessionId);
    return request<AuditResponse>(`/sessions/${sessionId}/audit`, {
      accessToken,
      signal,
    });
  },

  createSession(
    accessToken: string,
    groupId: string,
    title: string,
  ): Promise<AttendanceSession> {
    if (env.useMockApi) return mockApi.createSession(accessToken, groupId, title);
    return request<AttendanceSession>(`/groups/${groupId}/sessions`, {
      method: 'POST',
      accessToken,
      body: { title },
    });
  },

  getActiveSession(
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ): Promise<AttendanceSession> {
    if (env.useMockApi) return mockApi.getActiveSession(accessToken, groupId);
    return request<AttendanceSession>(`/groups/${groupId}/sessions/active`, {
      accessToken,
      signal,
    });
  },

  getSession(
    accessToken: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<AttendanceSession> {
    if (env.useMockApi) return mockApi.getSession(accessToken, sessionId);
    return request<AttendanceSession>(`/sessions/${sessionId}`, {
      accessToken,
      signal,
    });
  },

  getSessions(
    accessToken: string,
    groupId: string,
    signal?: AbortSignal,
  ): Promise<SessionsResponse> {
    if (env.useMockApi) return mockApi.getSessions(accessToken, groupId);
    return request<SessionsResponse>(`/groups/${groupId}/sessions?limit=50&offset=0`, {
      accessToken,
      signal,
    });
  },

  getQrToken(accessToken: string, sessionId: string): Promise<QrTokenResponse> {
    if (env.useMockApi) return mockApi.getQrToken(accessToken, sessionId);
    return request<QrTokenResponse>(`/sessions/${sessionId}/qr-token`, {
      method: 'POST',
      accessToken,
    });
  },

  getCheckInContext(
    accessToken: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<CheckInContext> {
    if (env.useMockApi) return mockApi.getCheckInContext(accessToken, token);
    return request<CheckInContext>(
      `/check-in/context?token=${encodeURIComponent(token)}`,
      {
        accessToken,
        signal,
      },
    );
  },

  checkIn(accessToken: string, token: string): Promise<CheckInResult> {
    if (env.useMockApi) return mockApi.checkIn(accessToken, token);
    return request<CheckInResult>('/check-ins', {
      method: 'POST',
      accessToken,
      body: { qr_token: token },
    });
  },

  getCheckIns(
    accessToken: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<CheckInsResponse> {
    if (env.useMockApi) return mockApi.getCheckIns(accessToken, sessionId);
    return request<CheckInsResponse>(`/sessions/${sessionId}/check-ins`, {
      accessToken,
      signal,
    });
  },

  correctCheckIn(
    accessToken: string,
    sessionId: string,
    input: ManualCorrectionInput,
  ): Promise<CheckInsResponse> {
    if (env.useMockApi) return mockApi.correctCheckIn(accessToken, sessionId, input);
    return request<CheckInsResponse>(`/sessions/${sessionId}/check-ins/manual`, {
      method: 'POST',
      accessToken,
      body: input,
    });
  },

  exportSessionCsv(accessToken: string, sessionId: string): Promise<Blob> {
    if (env.useMockApi) return mockApi.exportSessionCsv(accessToken, sessionId);
    return requestBlob(`/sessions/${sessionId}/export.csv`, { accessToken });
  },

  closeSession(accessToken: string, sessionId: string): Promise<AttendanceSession> {
    if (env.useMockApi) return mockApi.closeSession(accessToken, sessionId);
    return request<AttendanceSession>(`/sessions/${sessionId}/close`, {
      method: 'POST',
      accessToken,
    });
  },
};
