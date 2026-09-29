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
  max_user_id: string | null;
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

export interface Student {
  id: string;
  max_user_id: string | null;
  display_name: string;
}

export interface StudentsResponse {
  items: Student[];
}

export interface EnrollStudentInput {
  max_user_id: string;
  display_name: string;
}

export interface ImportStudentsResult {
  imported: number;
  already_enrolled: number;
}

export interface GroupStats {
  group_id: string;
  sessions_count: number;
  closed_sessions_count: number;
  total_check_ins: number;
  average_attendance_percent: number;
}

export interface AuditItem {
  id: string;
  actor_id: string;
  action: string;
  subject_student_id: string | null;
  reason: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface AuditResponse {
  items: AuditItem[];
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
  attendance_status: 'present' | 'late';
  source: 'qr' | 'manual';
}

export interface CheckInsResponse {
  session_id: string;
  status: SessionStatus;
  present_count: number;
  student_count: number;
  items: CheckInItem[];
}

export interface SessionsResponse {
  items: AttendanceSession[];
}

export type ManualCorrectionAction = 'add' | 'remove' | 'set_status';
export type AttendanceStatus = 'present' | 'late';

export interface ManualCorrectionInput {
  student_id: string;
  action: ManualCorrectionAction;
  attendance_status?: AttendanceStatus;
  reason: string;
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
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';
