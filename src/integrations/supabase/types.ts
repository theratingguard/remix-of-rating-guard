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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          resource: string | null
          resource_id: string | null
          result: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          resource?: string | null
          resource_id?: string | null
          result?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          resource?: string | null
          resource_id?: string | null
          result?: string
          user_id?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          id: string
          is_seed: boolean
          latitude: number | null
          longitude: number | null
          maps_uri: string | null
          name: string
          place_id: string | null
          rating: number | null
          total_reviews: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_seed?: boolean
          latitude?: number | null
          longitude?: number | null
          maps_uri?: string | null
          name: string
          place_id?: string | null
          rating?: number | null
          total_reviews?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_seed?: boolean
          latitude?: number | null
          longitude?: number | null
          maps_uri?: string | null
          name?: string
          place_id?: string | null
          rating?: number | null
          total_reviews?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      debug_findings: {
        Row: {
          actual: string | null
          component: string | null
          created_at: string
          description: string
          expected: string | null
          finding_code: string
          fix: string | null
          id: string
          module: string
          reproduction: string | null
          root_cause: string | null
          route: string | null
          severity: string
          status: string
          updated_at: string
          verification: string | null
        }
        Insert: {
          actual?: string | null
          component?: string | null
          created_at?: string
          description: string
          expected?: string | null
          finding_code: string
          fix?: string | null
          id?: string
          module: string
          reproduction?: string | null
          root_cause?: string | null
          route?: string | null
          severity: string
          status?: string
          updated_at?: string
          verification?: string | null
        }
        Update: {
          actual?: string | null
          component?: string | null
          created_at?: string
          description?: string
          expected?: string | null
          finding_code?: string
          fix?: string | null
          id?: string
          module?: string
          reproduction?: string | null
          root_cause?: string | null
          route?: string | null
          severity?: string
          status?: string
          updated_at?: string
          verification?: string | null
        }
        Relationships: []
      }
      error_events: {
        Row: {
          business: string | null
          code: string
          created_at: string
          id: string
          message: string
          module: string
          resolution: string | null
          route: string | null
          scan_id: string | null
          severity: string
          status: string
          user_id: string
        }
        Insert: {
          business?: string | null
          code: string
          created_at?: string
          id?: string
          message: string
          module: string
          resolution?: string | null
          route?: string | null
          scan_id?: string | null
          severity?: string
          status?: string
          user_id?: string
        }
        Update: {
          business?: string | null
          code?: string
          created_at?: string
          id?: string
          message?: string
          module?: string
          resolution?: string | null
          route?: string | null
          scan_id?: string | null
          severity?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_events_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      place_cache: {
        Row: {
          fetched_at: string
          payload: Json
          place_key: string
        }
        Insert: {
          fetched_at?: string
          payload: Json
          place_key: string
        }
        Update: {
          fetched_at?: string
          payload?: Json
          place_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          name: string
          status: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          name?: string
          status?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          high_risk_count: number
          id: string
          is_seed: boolean
          medium_risk_count: number
          normal_count: number
          recommended_action: string | null
          report_data: Json
          report_number: string
          scan_id: string
          status: string
          summary: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          high_risk_count?: number
          id?: string
          is_seed?: boolean
          medium_risk_count?: number
          normal_count?: number
          recommended_action?: string | null
          report_data?: Json
          report_number: string
          scan_id: string
          status?: string
          summary?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          high_risk_count?: number
          id?: string
          is_seed?: boolean
          medium_risk_count?: number
          normal_count?: number
          recommended_action?: string | null
          report_data?: Json
          report_number?: string
          scan_id?: string
          status?: string
          summary?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: true
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      review_actions: {
        Row: {
          created_at: string
          id: string
          note: string | null
          review_id: string
          scan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          review_id: string
          scan_id: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          review_id?: string
          scan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_actions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_actions_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      review_analyses: {
        Row: {
          analysis_provider: string | null
          analysis_version: string | null
          cached: boolean
          category: string | null
          confidence: number
          content_hash: string | null
          created_at: string
          evidence: string | null
          id: string
          model: string | null
          prompt_version: string | null
          reason: string | null
          review_id: string
          risk: string
          scan_id: string
          signals: string[]
          verification: Json | null
        }
        Insert: {
          analysis_provider?: string | null
          analysis_version?: string | null
          cached?: boolean
          category?: string | null
          confidence?: number
          content_hash?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          reason?: string | null
          review_id: string
          risk?: string
          scan_id: string
          signals?: string[]
          verification?: Json | null
        }
        Update: {
          analysis_provider?: string | null
          analysis_version?: string | null
          cached?: boolean
          category?: string | null
          confidence?: number
          content_hash?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          reason?: string | null
          review_id?: string
          risk?: string
          scan_id?: string
          signals?: string[]
          verification?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "review_analyses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_analyses_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author: string
          author_uri: string | null
          confidence: number
          content_hash: string | null
          created_at: string
          evidence: string | null
          id: string
          indicators: string[]
          policy_category: string | null
          processing_status: string
          published_at: string | null
          rating: number
          reason: string | null
          relative_time: string | null
          review_uri: string | null
          risk: string
          scan_id: string
          text: string | null
        }
        Insert: {
          author?: string
          author_uri?: string | null
          confidence?: number
          content_hash?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          indicators?: string[]
          policy_category?: string | null
          processing_status?: string
          published_at?: string | null
          rating: number
          reason?: string | null
          relative_time?: string | null
          review_uri?: string | null
          risk?: string
          scan_id: string
          text?: string | null
        }
        Update: {
          author?: string
          author_uri?: string | null
          confidence?: number
          content_hash?: string | null
          created_at?: string
          evidence?: string | null
          id?: string
          indicators?: string[]
          policy_category?: string | null
          processing_status?: string
          published_at?: string | null
          rating?: number
          reason?: string | null
          relative_time?: string | null
          review_uri?: string | null
          risk?: string
          scan_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_batches: {
        Row: {
          batch_number: number
          created_at: string
          id: string
          total: number
          user_id: string
        }
        Insert: {
          batch_number?: number
          created_at?: string
          id?: string
          total?: number
          user_id?: string
        }
        Update: {
          batch_number?: number
          created_at?: string
          id?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      scan_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_code: string | null
          id: string
          message: string | null
          scan_id: string
          stage: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          message?: string | null
          scan_id: string
          stage: string
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          message?: string | null
          scan_id?: string
          stage?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_events_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_jobs: {
        Row: {
          attempts: number
          batch_id: string
          created_at: string
          error: string | null
          id: string
          locked_until: string | null
          next_run_at: string
          position: number
          scan_id: string | null
          status: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          attempts?: number
          batch_id: string
          created_at?: string
          error?: string | null
          id?: string
          locked_until?: string | null
          next_run_at?: string
          position?: number
          scan_id?: string | null
          status?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          attempts?: number
          batch_id?: string
          created_at?: string
          error?: string | null
          id?: string
          locked_until?: string | null
          next_run_at?: string
          position?: number
          scan_id?: string | null
          status?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "scan_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_jobs_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          address: string | null
          api_rating_raw: number | null
          api_total_reviews_raw: number | null
          batch_id: string | null
          business_id: string | null
          business_name: string | null
          category: string | null
          completed_at: string | null
          created_at: string
          data_quality: string | null
          data_quality_reasons: string[]
          data_source: string
          error: string | null
          high_count: number
          id: string
          is_seed: boolean
          maps_uri: string | null
          medium_count: number
          normal_count: number
          place_id: string | null
          rating: number | null
          rating_mismatch: boolean
          requires_review_count: number
          review_health_score: number | null
          reviews_failed_analysis: number
          reviews_retrieved: number
          source_url: string
          stage: string | null
          started_at: string | null
          status: string
          total_reviews: number | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          api_rating_raw?: number | null
          api_total_reviews_raw?: number | null
          batch_id?: string | null
          business_id?: string | null
          business_name?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          data_quality?: string | null
          data_quality_reasons?: string[]
          data_source?: string
          error?: string | null
          high_count?: number
          id?: string
          is_seed?: boolean
          maps_uri?: string | null
          medium_count?: number
          normal_count?: number
          place_id?: string | null
          rating?: number | null
          rating_mismatch?: boolean
          requires_review_count?: number
          review_health_score?: number | null
          reviews_failed_analysis?: number
          reviews_retrieved?: number
          source_url: string
          stage?: string | null
          started_at?: string | null
          status?: string
          total_reviews?: number | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          api_rating_raw?: number | null
          api_total_reviews_raw?: number | null
          batch_id?: string | null
          business_id?: string | null
          business_name?: string | null
          category?: string | null
          completed_at?: string | null
          created_at?: string
          data_quality?: string | null
          data_quality_reasons?: string[]
          data_source?: string
          error?: string | null
          high_count?: number
          id?: string
          is_seed?: boolean
          maps_uri?: string | null
          medium_count?: number
          normal_count?: number
          place_id?: string | null
          rating?: number | null
          rating_mismatch?: boolean
          requires_review_count?: number
          review_health_score?: number | null
          reviews_failed_analysis?: number
          reviews_retrieved?: number
          source_url?: string
          stage?: string | null
          started_at?: string | null
          status?: string
          total_reviews?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "scan_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          draft: Json
          id: string
          published: Json
          published_at: string | null
          updated_at: string
        }
        Insert: {
          draft?: Json
          id?: string
          published?: Json
          published_at?: string | null
          updated_at?: string
        }
        Update: {
          draft?: Json
          id?: string
          published?: Json
          published_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_state: {
        Row: {
          daily_link_cap: number
          id: string
          last_worker_run: string | null
          pause_reason: string | null
          paused_at: string | null
          queue_paused: boolean
          updated_at: string
          worker_lock_until: string | null
        }
        Insert: {
          daily_link_cap?: number
          id?: string
          last_worker_run?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          queue_paused?: boolean
          updated_at?: string
          worker_lock_until?: string | null
        }
        Update: {
          daily_link_cap?: number
          id?: string
          last_worker_run?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          queue_paused?: boolean
          updated_at?: string
          worker_lock_until?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_worker_lock: { Args: { _seconds: number }; Returns: boolean }
      claim_scan_jobs: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          batch_id: string
          created_at: string
          error: string | null
          id: string
          locked_until: string | null
          next_run_at: string
          position: number
          scan_id: string | null
          status: string
          updated_at: string
          url: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scan_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
