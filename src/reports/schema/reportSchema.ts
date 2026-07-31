/**
 * TypeScript types for report definitions matching the shared.report_definitions table.
 *
 * These types mirror the database schema plus Request/Response shapes for the API.
 * The band-oriented report rendering engine lives in server/reports/.
 */

// ─── Database entity (matches shared.report_definitions row) ───

export interface ReportDefinition {
  id: string;
  name: string;
  caption: string;
  description: string | null;
  category: string;
  template_file: string;
  output_formats: string[];
  source_table: string | null;
  filterable: boolean;
  parameters: ReportParameter[];
  bands: BandConfig;
  visible_to_roles: string[];
  auto_generate: ScheduleConfig | null;
  enabled: boolean;
  company_id: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Sub-types ───

export interface ReportParameter {
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'lookup' | 'boolean' | 'select';
  required?: boolean;
  default?: unknown;
  table?: string;          // For lookup type — the DB table to query
  options?: string[];      // For select type — enum choices
  placeholder?: string;
}

export interface BandConfig {
  cover?: BandRowRange;
  title?: BandRowRange;
  header?: BandRowRange;
  detail?: BandRowRange;
  summary?: BandRowRange;
  footer?: BandRowRange;
}

export interface BandRowRange {
  start_row: number;
  end_row: number;
}

export interface ScheduleConfig {
  cron: string;             // Cron expression (e.g., '0 6 * * 1' for Monday 6am)
  format: string;           // Output format for auto-generation
  recipients: string[];     // Email or distribution list
  subject?: string;         // Email subject override
}

// ─── API Request/Response types ───

export interface CreateReportDefinitionRequest {
  name: string;
  caption: string;
  description?: string | null;
  category?: string;
  template_file: string;
  output_formats?: string[];
  source_table?: string | null;
  filterable?: boolean;
  parameters?: ReportParameter[];
  bands?: BandConfig;
  visible_to_roles?: string[];
  auto_generate?: ScheduleConfig | null;
  enabled?: boolean;
}

export interface UpdateReportDefinitionRequest {
  name?: string;
  caption?: string;
  description?: string | null;
  category?: string;
  template_file?: string;
  output_formats?: string[];
  source_table?: string | null;
  filterable?: boolean;
  parameters?: ReportParameter[];
  bands?: BandConfig;
  visible_to_roles?: string[];
  auto_generate?: ScheduleConfig | null;
  enabled?: boolean;
}

export interface ReportListQueryParams {
  category?: string;
  format?: string;
  enabled?: boolean;
  search?: string;
}