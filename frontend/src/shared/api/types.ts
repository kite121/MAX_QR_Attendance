export type UserRole = 'teacher' | 'student';
export type SessionStatus = 'active' | 'closed';
export type CheckInContextStatus =
  | 'available'
  | 'expired'
  | 'session_closed'
  | 'not_enrolled'
  | 'already_checked_in';

export interface User {
  id: string;
  max_user_id: string;
  display_name: string;
  role: UserRole;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface Group {
  id: string;
  name: string;
  student_count: number;
}

export interface GroupsResponse {
  items: Group[];
}

export interface AttendanceSession {
  id: string;
  group_id: string;
  title: string;
  status: SessionStatus;
  started_at: string;
  closed_at?: string;
  present_count?: number;
}

export interface QrTokenResponse {
  token: string;
  deep_link: string;
  expires_at: string;
}

export interface CheckInContext {
  session_id: string;
  lesson_title: string;
  group_name: string;
  teacher_name: string;
  status: CheckInContextStatus;
  expires_at: string;
}

export interface CheckInResult {
  status: 'checked_in';
  checked_in_at: string;
  session_id: string;
}

export interface CheckInItem {
  student_id: string;
  display_name: string;
  checked_in_at: string;
}

export interface CheckInsResponse {
  session_id: string;
  status: SessionStatus;
  present_count: number;
  student_count: number;
  items: CheckInItem[];
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details: unknown;
  };
}

export type ApiErrorCode =
  | 'INVALID_INIT_DATA'
  | 'INIT_DATA_EXPIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'GROUP_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'QR_TOKEN_INVALID'
  | 'QR_TOKEN_EXPIRED'
  | 'STUDENT_NOT_ENROLLED'
  | 'ALREADY_CHECKED_IN'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';
