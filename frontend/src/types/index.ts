export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  is_super_admin: boolean;
  orgs: OrgSummary[];
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  role: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  is_active: boolean;
  created_at: string;
  member_count?: number;
}

export interface BusinessHoursDay {
  open: string;
  close: string;
  enabled: boolean;
}

export interface BusinessHours {
  enabled: boolean;
  timezone: string;
  monday:    BusinessHoursDay;
  tuesday:   BusinessHoursDay;
  wednesday: BusinessHoursDay;
  thursday:  BusinessHoursDay;
  friday:    BusinessHoursDay;
  saturday:  BusinessHoursDay;
  sunday:    BusinessHoursDay;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  timezone: string;
  is_active: boolean;
  meta_pixel_id: string | null;
  meta_ad_account_id: string | null;
  has_meta_conversions_token: boolean;
  business_hours: BusinessHours | null;
  follow_up_enabled: boolean;
  ai_analysis_enabled: boolean;
  ai_ignore_groups: boolean;
  ai_provider: string | null;
  ai_model: string | null;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  sla_response_minutes: number | null;
  created_at: string;
  member_count?: number;
  inbox_count?: number;
}

export interface Inbox {
  id: string;
  workspace_id: string;
  name: string;
  channel_type: 'whatsapp_evolution' | 'whatsapp_official' | 'instagram' | 'facebook';
  phone_number: string | null;
  evolution_api_url: string | null;
  evolution_instance: string | null;
  connection_status: 'connected' | 'disconnected' | 'connecting';
  qr_code: string | null;
  is_active: boolean;
  auto_assign: boolean;
  chatbot_enabled: boolean;
  chatbot_prompt: string | null;
  webhook_secret: string | null;
  conversation_count?: number;
}

export interface Contact {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string | null;
  custom_fields: Record<string, unknown>;
  meta_lead_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
  conversation_count?: number;
  deal_count?: number;
}

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  inbox_id: string;
  contact_id: string;
  deal_id: string | null;
  assignee_id: string | null;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  remote_jid: string;
  last_message_at: string | null;
  last_message_text: string | null;
  unread_count: number;
  sla_breached: boolean;
  bot_active: boolean;
  csat_rating: number | null;
  csat_comment: string | null;
  created_at: string;
  // Joined
  contact_name: string;
  contact_phone: string | null;
  contact_avatar: string | null;
  inbox_name: string;
  inbox_channel: string;
  assignee_name: string | null;
  assignee_avatar: string | null;
  department_name: string | null;
  department_color: string | null;
  labels: Label[];
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: string | null;
  media_url: string | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  is_private: boolean;
  evolution_msg_id: string | null;
  created_at: string;
}

export interface CannedResponse {
  id: string;
  workspace_id: string;
  shortcut: string;
  content: string;
  created_by: string | null;
  created_by_name: string | null;
}

export interface KanbanStage {
  id: string;
  workspace_id: string;
  pipeline_id: string | null;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  ai_prompt: string | null;
  deal_count: number;
  total_value: number;
  deals: Deal[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
  ai_prompt: string | null;
  deal_count: number;
  total_value: number;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
  created_at: string;
  stages: PipelineStage[];
  inbox_ids: string[];
  department_ids: string[];
}

export interface Deal {
  id: string;
  workspace_id: string;
  contact_id: string;
  stage_id: string;
  pipeline_id: string | null;
  assignee_id: string | null;
  conversation_id: string | null;
  title: string;
  value: number;
  currency: string;
  priority: 'low' | 'medium' | 'high';
  lost_reason: string | null;
  closed_at: string | null;
  created_at: string;
  // AI fields
  ai_qualification: string | null;
  ai_summary: string | null;
  ai_analyzed_at: string | null;
  // Joined
  contact_name: string;
  contact_phone: string | null;
  contact_avatar: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  stage_name: string;
  stage_color: string;
  // From conversation join
  conv_status: string | null;
  conv_inbox_id: string | null;
  response_time_seconds: number | null;
  last_inbound_at: string | null;
  unread_count: number | null;
}

export interface AgentReport {
  id: string;
  name: string;
  avatar_url: string | null;
  total_conversations: number;
  resolved: number;
  avg_response_time_seconds: number | null;
  avg_csat: number | null;
  messages_sent: number;
}

export interface VolumeByDay {
  date: string;
  total: number;
  resolved: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── Tickets ───────────────────────────────────────────────────────────────────

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketBoardRole = 'viewer' | 'member' | 'manager';
export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';

export interface TicketLabel {
  id: string;
  name: string;
  color: string;
}

export interface Ticket {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  created_by: string | null;
  created_by_name: string | null;
  priority: TicketPriority;
  due_date: string | null;
  position: number;
  estimated_hours: number | null;
  conversation_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  is_recurring: boolean;
  recurrence_type: RecurrenceType | null;
  recurrence_interval: number | null;
  recurrence_end: string | null;
  parent_ticket_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  labels: TicketLabel[];
  total_time_seconds: number;
  // Extended (board/my-tasks view)
  board_name?: string;
  board_color?: string;
  column_name?: string;
  column_color?: string;
  column_is_done?: boolean;
}

export interface TicketColumn {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
  tickets: Ticket[];
}

export interface TicketBoard {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  is_archived: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  columns: TicketColumn[];
  column_count?: number;
  ticket_count?: number;
  user_role?: TicketBoardRole;
}

export interface TicketBoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: TicketBoardRole;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface TicketTimeLog {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
}

export interface TicketReminder {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name: string;
  remind_at: string;
  message: string | null;
  sent: boolean;
}

export interface TicketResolutionReport {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  total_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number | null;
  total_hours_logged: number;
}
