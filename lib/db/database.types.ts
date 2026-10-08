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
  public: {
    Tables: {
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
          kind: Database["public"]["Enums"]["admission_kind"]
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
          kind?: Database["public"]["Enums"]["admission_kind"]
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
          kind?: Database["public"]["Enums"]["admission_kind"]
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
          actor_label: string | null
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
          actor_label?: string | null
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
          actor_label?: string | null
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
      calendar_exceptions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          off_date: string
          program_id: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          off_date: string
          program_id: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          off_date?: string
          program_id?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_exceptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_calendar_exceptions_track"
            columns: ["track_id", "program_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "program_id"]
          },
        ]
      }
      commitment_archive: {
        Row: {
          calendar_date: string
          compensated_at: string | null
          completed_days: number[]
          created_at: string
          deadline: string
          deleted_at: string | null
          id: string
          participant_id: string
          plan_day: number
          plan_id: string
          status: Database["public"]["Enums"]["commitment_status"]
          track_id: string
          updated_at: string
        }
        Insert: {
          calendar_date: string
          compensated_at?: string | null
          completed_days?: number[]
          created_at?: string
          deadline: string
          deleted_at?: string | null
          id?: string
          participant_id: string
          plan_day: number
          plan_id: string
          status: Database["public"]["Enums"]["commitment_status"]
          track_id: string
          updated_at?: string
        }
        Update: {
          calendar_date?: string
          compensated_at?: string | null
          completed_days?: number[]
          created_at?: string
          deadline?: string
          deleted_at?: string | null
          id?: string
          participant_id?: string
          plan_day?: number
          plan_id?: string
          status?: Database["public"]["Enums"]["commitment_status"]
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_archive_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_archive_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_archive_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      content_units: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          label: string | null
          program_id: string
          section_id: string | null
          sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          program_id: string
          section_id?: string | null
          sequence: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string | null
          program_id?: string
          section_id?: string | null
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
          {
            foreignKeyName: "fk_content_units_section"
            columns: ["section_id", "program_id"]
            isOneToOne: false
            referencedRelation: "material_sections"
            referencedColumns: ["id", "program_id"]
          },
        ]
      }
      day_completions: {
        Row: {
          completed_at: string
          created_at: string
          day_number: number
          deleted_at: string | null
          id: string
          participant_id: string
          plan_id: string
          track_id: string
          undone_at: string | null
          updated_at: string
        }
        Insert: {
          completed_at: string
          created_at?: string
          day_number: number
          deleted_at?: string | null
          id?: string
          participant_id: string
          plan_id: string
          track_id: string
          undone_at?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          day_number?: number
          deleted_at?: string | null
          id?: string
          participant_id?: string
          plan_id?: string
          track_id?: string
          undone_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_completions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_completions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_completions_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      day_openings: {
        Row: {
          created_at: string
          day_number: number
          deleted_at: string | null
          id: string
          opened_at: string
          participant_id: string
          plan_id: string
          track_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number: number
          deleted_at?: string | null
          id?: string
          opened_at: string
          participant_id: string
          plan_id: string
          track_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          deleted_at?: string | null
          id?: string
          opened_at?: string
          participant_id?: string
          plan_id?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_openings_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_openings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_openings_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
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
      deadline_history: {
        Row: {
          created_at: string
          deadline: string
          deleted_at: string | null
          effective_from: string
          id: string
          program_id: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline: string
          deleted_at?: string | null
          effective_from: string
          id?: string
          program_id: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string
          deleted_at?: string | null
          effective_from?: string
          id?: string
          program_id?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_history_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deadline_history_track"
            columns: ["track_id", "program_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "program_id"]
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
      field_counts: {
        Row: {
          count: number
          created_at: string
          day_number: number
          deleted_at: string | null
          id: string
          participant_id: string
          plan_id: string
          task_field_id: string
          track_id: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          day_number: number
          deleted_at?: string | null
          id?: string
          participant_id: string
          plan_id: string
          task_field_id: string
          track_id: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          day_number?: number
          deleted_at?: string | null
          id?: string
          participant_id?: string
          plan_id?: string
          task_field_id?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_counts_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_counts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_counts_task_field_id_fkey"
            columns: ["task_field_id"]
            isOneToOne: false
            referencedRelation: "task_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_counts_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      field_marks: {
        Row: {
          created_at: string
          day_number: number
          deleted_at: string | null
          id: string
          marked_at: string
          participant_id: string
          plan_id: string
          task_field_id: string
          track_id: string
          undone_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_number: number
          deleted_at?: string | null
          id?: string
          marked_at: string
          participant_id: string
          plan_id: string
          task_field_id: string
          track_id: string
          undone_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_number?: number
          deleted_at?: string | null
          id?: string
          marked_at?: string
          participant_id?: string
          plan_id?: string
          task_field_id?: string
          track_id?: string
          undone_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_marks_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_marks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_marks_task_field_id_fkey"
            columns: ["task_field_id"]
            isOneToOne: false
            referencedRelation: "task_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_marks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      help_entries: {
        Row: {
          answer: string
          category: string
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
          category?: string
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
          category?: string
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
      material_sections: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          program_id: string
          sort_order: number
          unit_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          program_id: string
          sort_order: number
          unit_count: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          program_id?: string
          sort_order?: number
          unit_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_sections_program_id_fkey"
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
          judge_from: string
          program_id: string
          registration_no: number | null
          status: Database["public"]["Enums"]["participant_status"]
          track_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          baseline_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          judge_from?: string
          program_id: string
          registration_no?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          track_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          baseline_percentage?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          joined_at?: string
          judge_from?: string
          program_id?: string
          registration_no?: number | null
          status?: Database["public"]["Enums"]["participant_status"]
          track_id?: string | null
          updated_at?: string
          user_id?: string | null
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
        ]
      }
      plan_import_mappings: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          mapping: Json
          name: string
          program_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mapping: Json
          name: string
          program_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mapping?: Json
          name?: string
          program_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_import_mappings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_values: {
        Row: {
          amount: number | null
          created_at: string
          day_number: number
          deleted_at: string | null
          from_sequence: number | null
          id: string
          plan_id: string
          repetition: number | null
          task_field_id: string
          to_sequence: number | null
          updated_at: string
          value: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          day_number: number
          deleted_at?: string | null
          from_sequence?: number | null
          id?: string
          plan_id: string
          repetition?: number | null
          task_field_id: string
          to_sequence?: number | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          day_number?: number
          deleted_at?: string | null
          from_sequence?: number | null
          id?: string
          plan_id?: string
          repetition?: number | null
          task_field_id?: string
          to_sequence?: number | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_values_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_values_task_field_id_fkey"
            columns: ["task_field_id"]
            isOneToOne: false
            referencedRelation: "task_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string
          plan_id: string
          snapshot: Json
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note: string
          plan_id: string
          snapshot: Json
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string
          plan_id?: string
          snapshot?: Json
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
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
          day_count: number
          deleted_at: string | null
          id: string
          name: string
          program_id: string
          track_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_count?: number
          deleted_at?: string | null
          id?: string
          name: string
          program_id: string
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_count?: number
          deleted_at?: string | null
          id?: string
          name?: string
          program_id?: string
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_plans_track_program"
            columns: ["track_id", "program_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id", "program_id"]
          },
          {
            foreignKeyName: "plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_identities: {
        Row: {
          created_at: string
          deleted_at: string | null
          guardian_phone: string | null
          id: string
          national_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          guardian_phone?: string | null
          id?: string
          national_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          guardian_phone?: string | null
          id?: string
          national_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          family_name: string | null
          father_name: string | null
          first_name: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender"] | null
          grandfather_name: string | null
          id: string
          nationality: string | null
          phone: string | null
          phone_secondary: string | null
          purge_after: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          family_name?: string | null
          father_name?: string | null
          first_name?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender"] | null
          grandfather_name?: string | null
          id?: string
          nationality?: string | null
          phone?: string | null
          phone_secondary?: string | null
          purge_after?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          family_name?: string | null
          father_name?: string | null
          first_name?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"] | null
          grandfather_name?: string | null
          id?: string
          nationality?: string | null
          phone?: string | null
          phone_secondary?: string | null
          purge_after?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      program_schedule: {
        Row: {
          created_at: string
          deleted_at: string | null
          ends_on: string | null
          id: string
          note: string
          program_id: string
          starts_on: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          ends_on?: string | null
          id?: string
          note?: string
          program_id: string
          starts_on: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          ends_on?: string | null
          id?: string
          note?: string
          program_id?: string
          starts_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_schedule_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          allowed_gender: Database["public"]["Enums"]["gender"] | null
          award_percentage: number | null
          capacity: number | null
          compensation_enabled: boolean
          contact: string
          created_at: string
          credit_enabled: boolean
          daily_limit: number
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["program_kind"]
          min_age: number | null
          name: string
          participant_label: string
          passing_percentage: number | null
          progress_measure: Database["public"]["Enums"]["progress_measure"]
          registration_closes_at: string | null
          registration_opens_at: string | null
          registration_prefix: string | null
          require_identity: boolean
          require_saudi_phone: boolean
          section_id: string
          section_label: string | null
          slug: string
          sort_order: number
          start_date: string | null
          status: Database["public"]["Enums"]["program_status"]
          summary: string
          unit_few: string | null
          unit_many: string | null
          unit_one: string | null
          unit_singular: string | null
          unit_two: string | null
          updated_at: string
          work_days: number[]
        }
        Insert: {
          allowed_gender?: Database["public"]["Enums"]["gender"] | null
          award_percentage?: number | null
          capacity?: number | null
          compensation_enabled?: boolean
          contact?: string
          created_at?: string
          credit_enabled?: boolean
          daily_limit?: number
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["program_kind"]
          min_age?: number | null
          name: string
          participant_label?: string
          passing_percentage?: number | null
          progress_measure?: Database["public"]["Enums"]["progress_measure"]
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          registration_prefix?: string | null
          require_identity?: boolean
          require_saudi_phone?: boolean
          section_id: string
          section_label?: string | null
          slug: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          summary?: string
          unit_few?: string | null
          unit_many?: string | null
          unit_one?: string | null
          unit_singular?: string | null
          unit_two?: string | null
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          allowed_gender?: Database["public"]["Enums"]["gender"] | null
          award_percentage?: number | null
          capacity?: number | null
          compensation_enabled?: boolean
          contact?: string
          created_at?: string
          credit_enabled?: boolean
          daily_limit?: number
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["program_kind"]
          min_age?: number | null
          name?: string
          participant_label?: string
          passing_percentage?: number | null
          progress_measure?: Database["public"]["Enums"]["progress_measure"]
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          registration_prefix?: string | null
          require_identity?: boolean
          require_saudi_phone?: boolean
          section_id?: string
          section_label?: string | null
          slug?: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          summary?: string
          unit_few?: string | null
          unit_many?: string | null
          unit_one?: string | null
          unit_singular?: string | null
          unit_two?: string | null
          updated_at?: string
          work_days?: number[]
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
          count_unit: string | null
          created_at: string
          default_repetition: number | null
          deleted_at: string | null
          id: string
          is_base: boolean
          is_constrained: boolean
          is_material_linked: boolean
          is_required: boolean
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          program_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          count_unit?: string | null
          created_at?: string
          default_repetition?: number | null
          deleted_at?: string | null
          id?: string
          is_base?: boolean
          is_constrained?: boolean
          is_material_linked?: boolean
          is_required?: boolean
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          program_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          count_unit?: string | null
          created_at?: string
          default_repetition?: number | null
          deleted_at?: string | null
          id?: string
          is_base?: boolean
          is_constrained?: boolean
          is_material_linked?: boolean
          is_required?: boolean
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
          decided_by_label: string | null
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
          decided_by_label?: string | null
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
          decided_by_label?: string | null
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
          compensation_enabled: boolean | null
          created_at: string
          credit_enabled: boolean | null
          daily_limit: number | null
          deleted_at: string | null
          description: string
          exceptions_overridden: boolean
          id: string
          name: string
          program_id: string
          progress_measure:
            | Database["public"]["Enums"]["progress_measure"]
            | null
          sort_order: number
          start_date: string | null
          start_date_overridden: boolean
          updated_at: string
          work_days: number[] | null
        }
        Insert: {
          capacity?: number | null
          compensation_enabled?: boolean | null
          created_at?: string
          credit_enabled?: boolean | null
          daily_limit?: number | null
          deleted_at?: string | null
          description?: string
          exceptions_overridden?: boolean
          id?: string
          name: string
          program_id: string
          progress_measure?:
            | Database["public"]["Enums"]["progress_measure"]
            | null
          sort_order?: number
          start_date?: string | null
          start_date_overridden?: boolean
          updated_at?: string
          work_days?: number[] | null
        }
        Update: {
          capacity?: number | null
          compensation_enabled?: boolean | null
          created_at?: string
          credit_enabled?: boolean | null
          daily_limit?: number | null
          deleted_at?: string | null
          description?: string
          exceptions_overridden?: boolean
          id?: string
          name?: string
          program_id?: string
          progress_measure?:
            | Database["public"]["Enums"]["progress_measure"]
            | null
          sort_order?: number
          start_date?: string | null
          start_date_overridden?: boolean
          updated_at?: string
          work_days?: number[] | null
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
      fn_ar_digits: { Args: { p_value: string }; Returns: string }
      fn_archive_track: { Args: { p_track_id: string }; Returns: number }
      fn_attention_items: {
        Args: never
        Returns: {
          amount: number
          kind: string
          program_id: string
          program_name: string
        }[]
      }
      fn_auth_showcase: { Args: never; Returns: Json }
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
      fn_close_my_account: { Args: never; Returns: undefined }
      fn_complete_day_at: {
        Args: {
          p_at: string
          p_day: number
          p_participant_id: string
          p_plan_id: string
          p_track_id: string
        }
        Returns: boolean
      }
      fn_count_repetition: {
        Args: {
          p_day: number
          p_delta: number
          p_field_id: string
          p_participant_id: string
        }
        Returns: number
      }
      fn_count_repetition_at: {
        Args: {
          p_at: string
          p_day: number
          p_delta: number
          p_field_id: string
          p_participant_id: string
        }
        Returns: number
      }
      fn_create_plan: {
        Args: { p_copy?: boolean; p_program_id: string; p_track_id: string }
        Returns: string
      }
      fn_customize_engine_setting: {
        Args: { p_key: string; p_track_id: string }
        Returns: undefined
      }
      fn_cut_at: {
        Args: { p_date: string; p_program_id: string; p_track_id: string }
        Returns: string
      }
      fn_dashboard_counts: {
        Args: never
        Returns: {
          participants: number
          programs: number
          published: number
          role_holders: number
        }[]
      }
      fn_day_tasks: {
        Args: { p_day?: number; p_participant_id: string }
        Returns: {
          amount: number
          count: number
          count_unit: string
          day_number: number
          is_material_linked: boolean
          is_required: boolean
          kind: Database["public"]["Enums"]["field_kind"]
          label: string
          marked_at: string
          ord_from: number
          ord_to: number
          repetition: number
          sort_order: number
          task_field_id: string
          value: number
        }[]
      }
      fn_day_template_program_id: {
        Args: { p_template_id: string }
        Returns: string
      }
      fn_deadline_at: {
        Args: { p_date: string; p_program_id: string; p_track_id: string }
        Returns: string
      }
      fn_decide_track_change: {
        Args: { p_decision: string; p_program_id: string; p_request_id: string }
        Returns: undefined
      }
      fn_delete_account: { Args: { p_user_id: string }; Returns: undefined }
      fn_deleted_accounts: {
        Args: never
        Returns: {
          deleted_at: string
          full_name: string
          is_staff: boolean
          purge_after: string
          user_id: string
        }[]
      }
      fn_done_days_at: {
        Args: {
          p_at: string
          p_participant_id: string
          p_plan_id: string
          p_track_id: string
        }
        Returns: number
      }
      fn_due_days_at: {
        Args: {
          p_at: string
          p_base: number
          p_day_count: number
          p_program_id: string
          p_start: string
          p_track_id: string
        }
        Returns: number
      }
      fn_engine_access: {
        Args: { p_participant_id: string; p_write: boolean }
        Returns: undefined
      }
      fn_engine_lock: { Args: { p_participant_id: string }; Returns: undefined }
      fn_engine_require_day: {
        Args: {
          p_at: string
          p_day: number
          p_done_ok: boolean
          p_participant_id: string
        }
        Returns: Json
      }
      fn_engine_scope_check: {
        Args: { p_program_id: string; p_track_id: string }
        Returns: undefined
      }
      fn_engine_settings: {
        Args: { p_program_id: string; p_track_id?: string }
        Returns: {
          compensation_enabled: boolean
          credit_enabled: boolean
          daily_limit: number
          exceptions: string[]
          progress_measure: Database["public"]["Enums"]["progress_measure"]
          start_date: string
          work_days: number[]
        }[]
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
      fn_home_featured: { Args: never; Returns: string }
      fn_identity_masked: {
        Args: { p_user_id: string }
        Returns: {
          guardian_phone: string
          is_full: boolean
          national_id: string
        }[]
      }
      fn_inherit_engine_setting: {
        Args: { p_key: string; p_track_id: string }
        Returns: undefined
      }
      fn_is_active: { Args: never; Returns: boolean }
      fn_is_program_day: {
        Args: { p_date: string; p_program_id: string; p_track_id: string }
        Returns: boolean
      }
      fn_journey_state: { Args: { p_participant_id: string }; Returns: Json }
      fn_journey_state_at: {
        Args: { p_at: string; p_participant_id: string }
        Returns: Json
      }
      fn_local_now: { Args: { p_at?: string }; Returns: string }
      fn_mark_field: {
        Args: { p_day: number; p_field_id: string; p_participant_id: string }
        Returns: Json
      }
      fn_mark_field_at: {
        Args: {
          p_at: string
          p_day: number
          p_field_id: string
          p_participant_id: string
        }
        Returns: Json
      }
      fn_my_duties: {
        Args: never
        Returns: {
          contact: string
          day_count: number
          done_days: number
          due_days: number
          follows_plan: boolean
          last_marked_at: string
          participant_id: string
          program_id: string
          program_name: string
          program_status: Database["public"]["Enums"]["program_status"]
          progress_pct: number
          proposed_track: string
          status: Database["public"]["Enums"]["participant_status"]
          track_name: string
        }[]
      }
      fn_my_participant: { Args: { p_program_id: string }; Returns: string }
      fn_my_permissions: {
        Args: never
        Returns: {
          permission_code: string
          scope_program_id: string
        }[]
      }
      fn_open_next_day: { Args: { p_participant_id: string }; Returns: Json }
      fn_open_next_day_at: {
        Args: { p_at: string; p_participant_id: string }
        Returns: Json
      }
      fn_participant_engine: {
        Args: { p_participant_id: string }
        Returns: Record<string, unknown>
      }
      fn_participant_record: {
        Args: { p_participant_id: string }
        Returns: {
          done_days: number
          first_completed_at: string
          is_current: boolean
          last_completed_at: string
          track_id: string
          track_name: string
        }[]
      }
      fn_pending_invites: {
        Args: never
        Returns: {
          email: string
          invited_at: string
        }[]
      }
      fn_plan_issues: {
        Args: { p_plan_id: string }
        Returns: {
          day_number: number
          message: string
          severity: string
          task_field_id: string
          track_id: string
        }[]
      }
      fn_plan_locked_through: { Args: { p_plan_id: string }; Returns: number }
      fn_plan_program_id: { Args: { p_plan_id: string }; Returns: string }
      fn_plan_snapshot: { Args: { p_plan_id: string }; Returns: Json }
      fn_plan_tracks: { Args: { p_plan_id: string }; Returns: string[] }
      fn_profile_is_complete: {
        Args: { p: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      fn_program_days_through: {
        Args: {
          p_date: string
          p_program_id: string
          p_start: string
          p_track_id: string
        }
        Returns: number
      }
      fn_program_missing: { Args: { p_program_id: string }; Returns: string[] }
      fn_program_participants: {
        Args: { p_limit?: number; p_offset?: number; p_program_id: string }
        Returns: {
          baseline_percentage: number
          compensated_days: number
          day_count: number
          done_days: number
          due_days: number
          full_name: string
          id: string
          joined_at: string
          prior_done_days: number
          registration_no: number
          status: Database["public"]["Enums"]["participant_status"]
          stumbled_days: number
          total: number
          track_id: string
        }[]
      }
      fn_program_readiness: {
        Args: { p_program_id: string }
        Returns: {
          content_units: number
          missing: string[]
          participants: number
          public_blocks: number
          published: boolean
          task_fields: number
          tracks: number
          tracks_with_parts: number
          tracks_with_plan: number
        }[]
      }
      fn_programs_publish_state: {
        Args: never
        Returns: {
          can_write: boolean
          id: string
          kind: Database["public"]["Enums"]["program_kind"]
          missing: string[]
          name: string
          registration_state: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["program_status"]
        }[]
      }
      fn_progress_at: {
        Args: { p_at: string; p_participant_id: string }
        Returns: {
          day_count: number
          done_days: number
          percent: number
          reach_sequence: number
          share_size: number
          units: number
        }[]
      }
      fn_public_tracks: {
        Args: { p_program_id: string }
        Returns: {
          capacity: number
          description: string
          id: string
          name: string
          taken: number
          units: number
        }[]
      }
      fn_purge_account: { Args: { p_user_id: string }; Returns: undefined }
      fn_quick_setup: {
        Args: {
          p_day_count: number
          p_fields: Json
          p_lines: string[]
          p_program_id: string
        }
        Returns: Json
      }
      fn_rate_limit: {
        Args: { p_bucket: string; p_setting_prefix: string }
        Returns: boolean
      }
      fn_rate_limit_clear: { Args: { p_bucket: string }; Returns: undefined }
      fn_register: {
        Args: { p_answers?: Json; p_program_id: string; p_track_id: string }
        Returns: string
      }
      fn_registration_blockers: {
        Args: { p_program_id: string }
        Returns: string[]
      }
      fn_registration_state: { Args: { p_program_id: string }; Returns: string }
      fn_remove_custom_plan: { Args: { p_plan_id: string }; Returns: undefined }
      fn_restore_plan_version: {
        Args: { p_version_id: string }
        Returns: number
      }
      fn_role_is_system: { Args: { p_role_id: string }; Returns: boolean }
      fn_save_plan: {
        Args: {
          p_base_version?: number
          p_note?: string
          p_payload: Json
          p_plan_id: string
        }
        Returns: number
      }
      fn_set_engine_setting: {
        Args: {
          p_key: string
          p_program_id: string
          p_track_id: string
          p_value: Json
        }
        Returns: undefined
      }
      fn_set_material_sections: {
        Args: { p_expected?: string[]; p_program_id: string; p_sections: Json }
        Returns: undefined
      }
      fn_set_unit_labels: {
        Args: { p_labels: string[]; p_program_id: string; p_start: number }
        Returns: number
      }
      fn_settle_commitment_at: {
        Args: { p_participant_id: string; p_until: string }
        Returns: number
      }
      fn_settle_scope: {
        Args: { p_program_id: string; p_track_id: string }
        Returns: number
      }
      fn_track_has_plan: { Args: { p_track_id: string }; Returns: boolean }
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
      fn_track_plan: { Args: { p_track_id: string }; Returns: string }
      fn_track_program_id: { Args: { p_track_id: string }; Returns: string }
      fn_track_unit_at: {
        Args: { p_ordinal: number; p_track_id: string }
        Returns: number
      }
      fn_track_unit_count: { Args: { p_track_id: string }; Returns: number }
      fn_track_usage: {
        Args: { p_program_id: string }
        Returns: {
          live_participants: number
          plans: number
          track_id: string
        }[]
      }
      fn_undo_mark: {
        Args: { p_day: number; p_field_id: string; p_participant_id: string }
        Returns: Json
      }
      fn_undo_mark_at: {
        Args: {
          p_at: string
          p_day: number
          p_field_id: string
          p_participant_id: string
        }
        Returns: Json
      }
      fn_withdraw_participation: {
        Args: { p_participant_id: string }
        Returns: undefined
      }
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
      admission_kind: "text" | "choice" | "consent"
      block_type:
        | "header"
        | "free_text"
        | "image"
        | "tracks"
        | "faq"
        | "registration"
        | "hero"
        | "countdown"
        | "stats"
        | "timeline"
        | "prizes"
        | "terms"
        | "cta"
      change_direction: "up" | "down"
      commitment_status: "completed" | "exempt" | "stumbled"
      exam_stage: "interim" | "final"
      exam_type: "remote" | "oral"
      field_kind: "ranged" | "counted" | "explicit"
      gender: "male" | "female"
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
      progress_measure: "units" | "days"
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
  public: {
    Enums: {
      admission_kind: ["text", "choice", "consent"],
      block_type: [
        "header",
        "free_text",
        "image",
        "tracks",
        "faq",
        "registration",
        "hero",
        "countdown",
        "stats",
        "timeline",
        "prizes",
        "terms",
        "cta",
      ],
      change_direction: ["up", "down"],
      commitment_status: ["completed", "exempt", "stumbled"],
      exam_stage: ["interim", "final"],
      exam_type: ["remote", "oral"],
      field_kind: ["ranged", "counted", "explicit"],
      gender: ["male", "female"],
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
      progress_measure: ["units", "days"],
      publish_status: ["draft", "published"],
      request_status: ["pending", "approved", "rejected"],
    },
  },
} as const
