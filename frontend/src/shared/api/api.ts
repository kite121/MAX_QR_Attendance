import { env } from '../../config/env';
import { request } from './httpClient';
import { mockApi } from './mockApi';
import type {
  AttendanceSession,
  AuthResponse,
  CheckInContext,
  CheckInResult,
  CheckInsResponse,
  GroupsResponse,
  QrTokenResponse,
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

  closeSession(accessToken: string, sessionId: string): Promise<AttendanceSession> {
    if (env.useMockApi) return mockApi.closeSession(accessToken, sessionId);
    return request<AttendanceSession>(`/sessions/${sessionId}/close`, {
      method: 'POST',
      accessToken,
    });
  },
};
