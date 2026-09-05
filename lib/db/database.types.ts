export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          amount: number | null
          created_at: string
          deleted_at: string | null
          id: string
          is_done: boolean
          ordinal_end: number | null
          ordinal_start: number | null
          participant_id: string
          plan_day_id: string
          range_end: number | null
          range_start: number | null
          submitted_at: string
          task_field_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_done?: boolean
          ordinal_end?: number | null
          ordinal_start?: number | null
          participant_id: string
          plan_day_id: string
          range_end?: number | null
          range_start?: number | null
          submitted_at?: string
          task_field_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_done?: boolean
          ordinal_end?: number | null
          ordinal_start?: number | null
          participant_id?: string
          plan_day_id?: string
          range_end?: number | null
          range_start?: number | null
          submitted_at?: string
          task_field_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "achievements_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_task_field_id_fkey"
            columns: ["task_field_id"]
            isOneToOne: false
            referencedRelation: "task_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_answers: {
        Row: {
          answer: string
          created_at: string
          deleted_at: string | null
          id: string
          participant_id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          participant_id: string
          question_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          participant_id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "admission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_questions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_required: boolean
          program_id: string
          question: string
          sort_order: number
          track_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          program_id: string
          question: string
          sort_order?: number
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          program_id?: string
          question?: string
          sort_order?: number
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_questions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_questions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          entity_table: string | null
          id: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_table?: string | null
          id?: string
          mime_type?: string
          owner_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          entity_table: string
          id: string
          updated_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_table: string
          id?: string
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          entity_table?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_units: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          program_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          program_id: string
          sequence: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          program_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_units_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      day_template_fields: {
        Row: {
          base_amount: number
          created_at: string
          day_template_id: string
          deleted_at: string | null
          id: string
          sort_order: number
          task_field_id: string
          updated_at: string
        }
        Insert: {
          base_amount: number
          created_at?: string
          day_template_id: string
          deleted_at?: string | null
          id?: string
          sort_order?: number
          task_field_id: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          day_template_id?: string
          deleted_at?: string | null
          id?: string
          sort_order?: number
          task_field_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_template_fields_day_template_id_fkey"
            columns: ["day_template_id"]
            isOneToOne: false
            referencedRelation: "day_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_template_fields_task_field_id_fkey"
            columns: ["task_field_id"]
            isOneToOne: false
            referencedRelation: "task_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      day_templates: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          program_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          program_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_templates_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          award_percentage: number | null
          created_at: string
          deleted_at: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          judge_count: number | null
          max_skips: number | null
          name: string
          pass_percentage: number
          program_id: string
          question_count: number
          seconds_per_question: number | null
          stage: Database["public"]["Enums"]["exam_stage"]
          track_id: string | null
          updated_at: string
        }
        Insert: {
          award_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          judge_count?: number | null
          max_skips?: number | null
          name: string
          pass_percentage: number
          program_id: string
          question_count: number
          seconds_per_question?: number | null
          stage: Database["public"]["Enums"]["exam_stage"]
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          award_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          judge_count?: number | null
          max_skips?: number | null
          name?: string
          pass_percentage?: number
          program_id?: string
          question_count?: number
          seconds_per_question?: number | null
          stage?: Database["public"]["Enums"]["exam_stage"]
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_track_id_program_id_fkey"
            columns: ["track_id", "program_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "program_id"]
          },
        ]
      }
      help_entries: {
        Row: {
          answer: string
          created_at: string
          deleted_at: string | null
          id: string
          program_id: string
          question: string
          sort_order: number
          status: Database["public"]["Enums"]["publish_status"]
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          program_id: string
          question: string
          sort_order?: number
          status?: Database["public"]["Enums"]["publish_status"]
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          program_id?: string
          question?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["publish_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_entries_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_kinds: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          kind: string
          payload: Json
          recipient_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: string
          payload?: Json
          recipient_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          recipient_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["code"]
          },
        ]
      }
      page_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["block_type"]
          content: Json
          created_at: string
          deleted_at: string | null
          id: string
          program_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          block_type: Database["public"]["Enums"]["block_type"]
          content?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          program_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["block_type"]
          content?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          program_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_blocks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          baseline_percentage: number | null
          created_at: string
          deleted_at: string | null
          id: string
          joined_at: string
          program_id: string
          status: Database["public"]["Enums"]["participant_status"]
          track_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          program_id: string
          status?: Database["public"]["Enums"]["participant_status"]
          track_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          program_id?: string
          status?: Database["public"]["Enums"]["participant_status"]
          track_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_participants_track_program"
            columns: ["track_id", "program_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "program_id"]
          },
          {
            foreignKeyName: "participants_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_days: {
        Row: {
          amount_multiplier: number
          created_at: string
          day_number: number
          day_template_id: string | null
          day_type: Database["public"]["Enums"]["day_type"]
          deleted_at: string | null
          exam_id: string | null
          id: string
          plan_id: string
          updated_at: string
        }
        Insert: {
          amount_multiplier?: number
          created_at?: string
          day_number: number
          day_template_id?: string | null
          day_type: Database["public"]["Enums"]["day_type"]
          deleted_at?: string | null
          exam_id?: string | null
          id?: string
          plan_id: string
          updated_at?: string
        }
        Update: {
          amount_multiplier?: number
          created_at?: string
          day_number?: number
          day_template_id?: string | null
          day_type?: Database["public"]["Enums"]["day_type"]
          deleted_at?: string | null
          exam_id?: string | null
          id?: string
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_days_day_template_id_fkey"
            columns: ["day_template_id"]
            isOneToOne: false
            referencedRelation: "day_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_days_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          award_percentage: number
          capacity: number | null
          created_at: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["program_kind"]
          name: string
          participant_label: string
          passing_percentage: number
          registration_closes_at: string | null
          registration_opens_at: string | null
          section_id: string
          slug: string
          status: Database["public"]["Enums"]["program_status"]
          summary: string
          updated_at: string
        }
        Insert: {
          award_percentage?: number
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["program_kind"]
          name: string
          participant_label?: string
          passing_percentage?: number
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          section_id: string
          slug: string
          status?: Database["public"]["Enums"]["program_status"]
          summary?: string
          updated_at?: string
        }
        Update: {
          award_percentage?: number
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["program_kind"]
          name?: string
          participant_label?: string
          passing_percentage?: number
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          section_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["program_status"]
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          bucket: string
          created_at: string
          deleted_at: string | null
          id: string
          occurred_at: string
          updated_at: string
        }
        Insert: {
          bucket: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          occurred_at?: string
          updated_at?: string
        }
        Update: {
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          occurred_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          permission_code: string
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          permission_code: string
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          permission_code?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          key: string
          scope_program_id: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          key: string
          scope_program_id?: string | null
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          key?: string
          scope_program_id?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      task_fields: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          program_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          program_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["field_kind"]
          label?: string
          program_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_fields_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      track_change_requests: {
        Row: {
          baseline_percentage: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["change_direction"]
          from_track_id: string
          id: string
          participant_id: string
          reason: string
          status: Database["public"]["Enums"]["request_status"]
          to_track_id: string
          updated_at: string
        }
        Insert: {
          baseline_percentage: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["change_direction"]
          from_track_id: string
          id?: string
          participant_id: string
          reason: string
          status?: Database["public"]["Enums"]["request_status"]
          to_track_id: string
          updated_at?: string
        }
        Update: {
          baseline_percentage?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["change_direction"]
          from_track_id?: string
          id?: string
          participant_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["request_status"]
          to_track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_change_requests_from_track_id_fkey"
            columns: ["from_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_change_requests_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_change_requests_to_track_id_fkey"
            columns: ["to_track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_content_ranges: {
        Row: {
          created_at: string
          deleted_at: string | null
          from_sequence: number
          id: string
          sort_order: number
          to_sequence: number
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          from_sequence: number
          id?: string
          sort_order?: number
          to_sequence: number
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          from_sequence?: number
          id?: string
          sort_order?: number
          to_sequence?: number
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_content_ranges_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          capacity: number | null
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          name: string
          program_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          name: string
          program_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          name?: string
          program_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          role_id: string
          scope_program_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          role_id: string
          scope_program_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          role_id?: string
          scope_program_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_scope_program"
            columns: ["scope_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fn_bootstrap_admin: {
        Args: { p_full_name: string; p_phone: string; p_user_id: string }
        Returns: string
      }
      fn_can_grant_role: {
        Args: {
          p_program_id?: string
          p_role_id: string
          p_target_user: string
        }
        Returns: boolean
      }
      fn_day_template_program_id: {
        Args: { p_template_id: string }
        Returns: string
      }
      fn_follows_plan: {
        Args: { p_status: Database["public"]["Enums"]["participant_status"] }
        Returns: boolean
      }
      fn_has_permission: {
        Args: { p_code: string; p_program_id?: string }
        Returns: boolean
      }
      fn_hit_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_seconds: number }
        Returns: boolean
      }
      fn_is_active: { Args: never; Returns: boolean }
      fn_my_participant: { Args: { p_program_id: string }; Returns: string }
      fn_my_permissions: {
        Args: never
        Returns: {
          permission_code: string
          scope_program_id: string
        }[]
      }
      fn_participant_plan_id: {
        Args: { p_participant_id: string }
        Returns: string
      }
      fn_participant_track_id: {
        Args: { p_participant_id: string }
        Returns: string
      }
      fn_plan_day_tasks: {
        Args: { p_participant_id: string; p_plan_day_id: string }
        Returns: {
          amount: number
          is_done: boolean
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          ordinal_end: number
          ordinal_start: number
          range_end: number
          range_start: number
          sort_order: number
          submitted: boolean
          task_field_id: string
        }[]
      }
      fn_plan_insert_day: {
        Args: {
          p_amount_multiplier?: number
          p_at_number: number
          p_day_template_id?: string
          p_day_type: Database["public"]["Enums"]["day_type"]
          p_exam_id?: string
          p_plan_id: string
        }
        Returns: string
      }
      fn_plan_max_days: { Args: never; Returns: number }
      fn_plan_move_day: {
        Args: { p_plan_day_id: string; p_to_number: number }
        Returns: number
      }
      fn_plan_program_id: { Args: { p_plan_id: string }; Returns: string }
      fn_plan_remove_day: { Args: { p_plan_day_id: string }; Returns: number }
      fn_quick_setup: {
        Args: {
          p_day_count: number
          p_fields: Json
          p_lines: string[]
          p_program_id: string
          p_rest_every: number
        }
        Returns: Json
      }
      fn_rate_limit: {
        Args: { p_bucket: string; p_setting_prefix: string }
        Returns: boolean
      }
      fn_registration_state: { Args: { p_program_id: string }; Returns: string }
      fn_submit_day: {
        Args: { p_done_fields: string[]; p_plan_day_id: string }
        Returns: number
      }
      fn_track_ordinal_of: {
        Args: { p_sequence: number; p_track_id: string }
        Returns: number
      }
      fn_track_ordinal_span: {
        Args: { p_from: number; p_to: number; p_track_id: string }
        Returns: {
          from_sequence: number
          part_order: number
          to_sequence: number
        }[]
      }
      fn_track_program_id: { Args: { p_track_id: string }; Returns: string }
      fn_track_unit_at: {
        Args: { p_ordinal: number; p_track_id: string }
        Returns: number
      }
      fn_track_unit_count: { Args: { p_track_id: string }; Returns: number }
      fn_write_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_table: string
        }
        Returns: string
      }
    }
    Enums: {
      block_type:
        | "header"
        | "free_text"
        | "image"
        | "tracks"
        | "faq"
        | "registration"
      change_direction: "up" | "down"
      day_type: "normal" | "rest" | "exam"
      exam_stage: "interim" | "final"
      exam_type: "remote" | "oral"
      field_kind: "ranged" | "counted"
      notification_status: "pending" | "sent" | "failed" | "read"
      participant_status:
        | "registered"
        | "memorizing"
        | "qualified"
        | "not_qualified"
        | "passed"
        | "not_passed"
      program_kind: "competition" | "weekly_followup" | "remote_memorization"
      program_status: "draft" | "published" | "closed"
      publish_status: "draft" | "published"
      request_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_type: [
        "header",
        "free_text",
        "image",
        "tracks",
        "faq",
        "registration",
      ],
      change_direction: ["up", "down"],
      day_type: ["normal", "rest", "exam"],
      exam_stage: ["interim", "final"],
      exam_type: ["remote", "oral"],
      field_kind: ["ranged", "counted"],
      notification_status: ["pending", "sent", "failed", "read"],
      participant_status: [
        "registered",
        "memorizing",
        "qualified",
        "not_qualified",
        "passed",
        "not_passed",
      ],
      program_kind: ["competition", "weekly_followup", "remote_memorization"],
      program_status: ["draft", "published", "closed"],
      publish_status: ["draft", "published"],
      request_status: ["pending", "approved", "rejected"],
    },
  },
} as const
