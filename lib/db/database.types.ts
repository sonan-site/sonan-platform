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
      fn_bootstrap_admin: { Args: { p_user_id: string }; Returns: string }
      fn_can_grant_role: {
        Args: {
          p_program_id?: string
          p_role_id: string
          p_target_user: string
        }
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
      fn_my_permissions: {
        Args: never
        Returns: {
          permission_code: string
          scope_program_id: string
        }[]
      }
      fn_rate_limit: {
        Args: { p_bucket: string; p_setting_prefix: string }
        Returns: boolean
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
      block_type:
        | "header"
        | "free_text"
        | "image"
        | "tracks"
        | "faq"
        | "registration"
      notification_status: "pending" | "sent" | "failed" | "read"
      program_kind: "competition" | "weekly_followup" | "remote_memorization"
      program_status: "draft" | "published" | "closed"
      publish_status: "draft" | "published"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      notification_status: ["pending", "sent", "failed", "read"],
      program_kind: ["competition", "weekly_followup", "remote_memorization"],
      program_status: ["draft", "published", "closed"],
      publish_status: ["draft", "published"],
    },
  },
} as const
