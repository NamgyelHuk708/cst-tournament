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
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      match_actions: {
        Row: {
          created_at: string
          event_id: number | null
          id: number
          kind: string
          match_id: number
          new_status: Database["public"]["Enums"]["match_status"] | null
          payload: Json | null
          prev_away_pens: number | null
          prev_home_pens: number | null
          prev_period_started_at: string | null
          prev_status: Database["public"]["Enums"]["match_status"] | null
          undone_at: string | null
        }
        Insert: {
          created_at?: string
          event_id?: number | null
          id?: never
          kind: string
          match_id: number
          new_status?: Database["public"]["Enums"]["match_status"] | null
          payload?: Json | null
          prev_away_pens?: number | null
          prev_home_pens?: number | null
          prev_period_started_at?: string | null
          prev_status?: Database["public"]["Enums"]["match_status"] | null
          undone_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: number | null
          id?: never
          kind?: string
          match_id?: number
          new_status?: Database["public"]["Enums"]["match_status"] | null
          payload?: Json | null
          prev_away_pens?: number | null
          prev_home_pens?: number | null
          prev_period_started_at?: string | null
          prev_status?: Database["public"]["Enums"]["match_status"] | null
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "match_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_actions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          added_time: number | null
          client_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          match_id: number
          minute: number | null
          player_id: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          added_time?: number | null
          client_id?: string | null
          created_at?: string
          id?: never
          is_demo?: boolean
          match_id: number
          minute?: number | null
          player_id?: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          added_time?: number | null
          client_id?: string | null
          created_at?: string
          id?: never
          is_demo?: boolean
          match_id?: number
          minute?: number | null
          player_id?: string | null
          team_id?: number
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_team_id_fkey"
            columns: ["player_id", "team_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id", "team_id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "group_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        Insert: {
          away_pens?: number | null
          away_score?: number
          away_source?: Database["public"]["Enums"]["slot_source"] | null
          away_source_group?: string | null
          away_source_match?: number | null
          away_team_id?: number | null
          group_code?: string | null
          home_pens?: number | null
          home_score?: number
          home_source?: Database["public"]["Enums"]["slot_source"] | null
          home_source_group?: string | null
          home_source_match?: number | null
          home_team_id?: number | null
          id: number
          is_demo?: boolean
          kickoff_at: string
          notes?: string | null
          period_started_at?: string | null
          slot_label?: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Update: {
          away_pens?: number | null
          away_score?: number
          away_source?: Database["public"]["Enums"]["slot_source"] | null
          away_source_group?: string | null
          away_source_match?: number | null
          away_team_id?: number | null
          group_code?: string | null
          home_pens?: number | null
          home_score?: number
          home_source?: Database["public"]["Enums"]["slot_source"] | null
          home_source_group?: string | null
          home_source_match?: number | null
          home_team_id?: number | null
          id?: number
          is_demo?: boolean
          kickoff_at?: string
          notes?: string | null
          period_started_at?: string | null
          slot_label?: string | null
          stage?: Database["public"]["Enums"]["match_stage"]
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_source_match_fkey"
            columns: ["away_source_match"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "group_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_source_match_fkey"
            columns: ["home_source_match"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "group_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          shirt_number: number | null
          team_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          shirt_number?: number | null
          team_id: number
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          shirt_number?: number | null
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "group_standings"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          group_code: string
          id: number
          name: string
          short_code: string
          slot: string
          tiebreak_rank: number | null
        }
        Insert: {
          group_code: string
          id?: never
          name: string
          short_code: string
          slot: string
          tiebreak_rank?: number | null
        }
        Update: {
          group_code?: string
          id?: never
          name?: string
          short_code?: string
          slot?: string
          tiebreak_rank?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      group_standings: {
        Row: {
          drawn: number | null
          goal_difference: number | null
          goals_against: number | null
          goals_for: number | null
          group_code: string | null
          lost: number | null
          name: string | null
          played: number | null
          points: number | null
          position: number | null
          short_code: string | null
          slot: string | null
          team_id: number | null
          tiebreak_rank: number | null
          won: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_event: {
        Args: {
          p_client_id: string
          p_match: number
          p_team: number
          p_type: Database["public"]["Enums"]["event_type"]
        }
        Returns: {
          added_time: number | null
          client_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          match_id: number
          minute: number | null
          player_id: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }
        SetofOptions: {
          from: "*"
          to: "match_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_add_event_at: {
        Args: {
          p_added_time: number
          p_client_id: string
          p_match: number
          p_minute: number
          p_player: string
          p_team: number
          p_type: Database["public"]["Enums"]["event_type"]
        }
        Returns: {
          added_time: number | null
          client_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          match_id: number
          minute: number | null
          player_id: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }
        SetofOptions: {
          from: "*"
          to: "match_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_correct_status: {
        Args: {
          p_match: number
          p_status: Database["public"]["Enums"]["match_status"]
        }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_event: { Args: { p_event: number }; Returns: undefined }
      admin_fill_round_of_16: { Args: never; Returns: Json }
      admin_reset_match: {
        Args: { p_match: number }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_final_score: {
        Args: {
          p_away: number
          p_away_pens: number
          p_home: number
          p_home_pens: number
          p_match: number
        }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_ko_teams: {
        Args: { p_away: number; p_home: number; p_match: number }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_pens: {
        Args: { p_away: number; p_home: number; p_match: number }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_status: {
        Args: {
          p_match: number
          p_status: Database["public"]["Enums"]["match_status"]
        }
        Returns: {
          away_pens: number | null
          away_score: number
          away_source: Database["public"]["Enums"]["slot_source"] | null
          away_source_group: string | null
          away_source_match: number | null
          away_team_id: number | null
          group_code: string | null
          home_pens: number | null
          home_score: number
          home_source: Database["public"]["Enums"]["slot_source"] | null
          home_source_group: string | null
          home_source_match: number | null
          home_team_id: number | null
          id: number
          is_demo: boolean
          kickoff_at: string
          notes: string | null
          period_started_at: string | null
          slot_label: string | null
          stage: Database["public"]["Enums"]["match_stage"]
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_undo: { Args: { p_match: number }; Returns: Json }
      admin_update_event: {
        Args: {
          p_added_time: number
          p_event: number
          p_minute: number
          p_player: string
          p_team: number
          p_type: Database["public"]["Enums"]["event_type"]
        }
        Returns: {
          added_time: number | null
          client_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          match_id: number
          minute: number | null
          player_id: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }
        SetofOptions: {
          from: "*"
          to: "match_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_player: {
        Args: { p_name: string; p_shirt: number; p_team: number }
        Returns: string
      }
      credited_goals: {
        Args: {
          p_match: Database["public"]["Tables"]["matches"]["Row"]
          p_side: string
        }
        Returns: {
          added_time: number | null
          client_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          match_id: number
          minute: number | null
          player_id: string | null
          team_id: number
          type: Database["public"]["Enums"]["event_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "match_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_match_minute: {
        Args: {
          p_started: string
          p_status: Database["public"]["Enums"]["match_status"]
        }
        Returns: Record<string, unknown>
      }
      group_complete: { Args: { p_group: string }; Returns: boolean }
      group_position_team: {
        Args: { p_group: string; p_position: number }
        Returns: number
      }
      half_length_minutes: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      match_result_team: {
        Args: {
          m: Database["public"]["Tables"]["matches"]["Row"]
          p_want: string
        }
        Returns: number
      }
      require_admin: { Args: never; Returns: undefined }
      slot_name: { Args: { p_slot: string }; Returns: string }
    }
    Enums: {
      event_type: "goal" | "own_goal" | "yellow_card" | "red_card"
      match_stage:
        | "group"
        | "round_of_16"
        | "quarter_final"
        | "semi_final"
        | "third_place"
        | "final"
      match_status:
        | "scheduled"
        | "first_half"
        | "half_time"
        | "second_half"
        | "penalties"
        | "finished"
      slot_source:
        | "group_winner"
        | "group_runner_up"
        | "match_winner"
        | "match_loser"
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
      event_type: ["goal", "own_goal", "yellow_card", "red_card"],
      match_stage: [
        "group",
        "round_of_16",
        "quarter_final",
        "semi_final",
        "third_place",
        "final",
      ],
      match_status: [
        "scheduled",
        "first_half",
        "half_time",
        "second_half",
        "penalties",
        "finished",
      ],
      slot_source: [
        "group_winner",
        "group_runner_up",
        "match_winner",
        "match_loser",
      ],
    },
  },
} as const
