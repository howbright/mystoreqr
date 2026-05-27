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
      admin_action_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          order_id: string | null
          payload: Json
          store_slug: string
          summary: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          order_id?: string | null
          payload?: Json
          store_slug: string
          summary: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          order_id?: string | null
          payload?: Json
          store_slug?: string
          summary?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_status"]
          note: string | null
          order_id: string
          previous_status: Database["public"]["Enums"]["order_status"] | null
          store_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_status"]
          note?: string | null
          order_id: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          store_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_status"]
          note?: string | null
          order_id?: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          bank_depositor_name: string | null
          cancel_reason: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_name: string
          customer_note: string | null
          customer_phone: string
          delivery_address: string | null
          delivery_address_detail: string | null
          delivery_fee: number
          fulfillment_type: Database["public"]["Enums"]["order_fulfillment_type"]
          id: string
          lookup_token: string
          order_code: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          postal_code: string | null
          price_note: string | null
          price_status: Database["public"]["Enums"]["order_price_status"]
          quoted_at: string | null
          quoted_by: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_amount: number | null
          total_amount: number | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          bank_depositor_name?: string | null
          cancel_reason?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name: string
          customer_note?: string | null
          customer_phone: string
          delivery_address?: string | null
          delivery_address_detail?: string | null
          delivery_fee?: number
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          lookup_token?: string
          order_code?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          postal_code?: string | null
          price_note?: string | null
          price_status?: Database["public"]["Enums"]["order_price_status"]
          quoted_at?: string | null
          quoted_by?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_amount?: number | null
          total_amount?: number | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          bank_depositor_name?: string | null
          cancel_reason?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_name?: string
          customer_note?: string | null
          customer_phone?: string
          delivery_address?: string | null
          delivery_address_detail?: string | null
          delivery_fee?: number
          fulfillment_type?: Database["public"]["Enums"]["order_fulfillment_type"]
          id?: string
          lookup_token?: string
          order_code?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          postal_code?: string | null
          price_note?: string | null
          price_status?: Database["public"]["Enums"]["order_price_status"]
          quoted_at?: string | null
          quoted_by?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal_amount?: number | null
          total_amount?: number | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          is_sold_out: boolean
          name: string
          price: number | null
          sku: string | null
          store_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name: string
          price?: number | null
          sku?: string | null
          store_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name?: string
          price?: number | null
          sku?: string | null
          store_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_admins: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["store_admin_role"]
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["store_admin_role"]
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["store_admin_role"]
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_admins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address_detail: string | null
          address_road: string | null
          bank_account_holder: string
          bank_account_number: string
          bank_name: string
          business_registration_number: string | null
          created_at: string
          delivery_enabled: boolean
          delivery_fee: number
          description: string | null
          id: string
          is_active: boolean
          min_order_amount: number
          name: string
          order_policy: string | null
          phone: string | null
          pickup_enabled: boolean
          postal_code: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          address_detail?: string | null
          address_road?: string | null
          bank_account_holder: string
          bank_account_number: string
          bank_name: string
          business_registration_number?: string | null
          created_at?: string
          delivery_enabled?: boolean
          delivery_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name: string
          order_policy?: string | null
          phone?: string | null
          pickup_enabled?: boolean
          postal_code?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          address_detail?: string | null
          address_road?: string | null
          bank_account_holder?: string
          bank_account_number?: string
          bank_name?: string
          business_registration_number?: string | null
          created_at?: string
          delivery_enabled?: boolean
          delivery_fee?: number
          description?: string | null
          id?: string
          is_active?: boolean
          min_order_amount?: number
          name?: string
          order_policy?: string | null
          phone?: string | null
          pickup_enabled?: boolean
          postal_code?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      transfer_reports: {
        Row: {
          created_at: string
          depositor_name: string
          depositor_phone: string | null
          id: string
          note: string | null
          order_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["transfer_report_status"]
          transferred_amount: number
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          depositor_name: string
          depositor_phone?: string | null
          id?: string
          note?: string | null
          order_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["transfer_report_status"]
          transferred_amount: number
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          depositor_name?: string
          depositor_phone?: string | null
          id?: string
          note?: string | null
          order_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["transfer_report_status"]
          transferred_amount?: number
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_code: { Args: never; Returns: string }
      get_order_tracking: {
        Args: { p_customer_phone: string; p_lookup_token: string }
        Returns: {
          created_at: string
          order_code: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }[]
      }
      get_order_tracking_v2: {
        Args: { p_customer_phone: string; p_lookup_token: string }
        Returns: {
          created_at: string
          delivery_fee: number
          order_code: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_note: string
          price_status: Database["public"]["Enums"]["order_price_status"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal_amount: number
          total_amount: number
          updated_at: string
        }[]
      }
      is_order_store_admin: { Args: { p_order_id: string }; Returns: boolean }
      is_store_admin: { Args: { p_store_id: string }; Returns: boolean }
      quote_order_price: {
        Args: {
          p_delivery_fee: number
          p_order_id: string
          p_price_note?: string
          p_subtotal_amount: number
        }
        Returns: {
          delivery_fee: number
          order_code: string
          order_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          price_status: Database["public"]["Enums"]["order_price_status"]
          quoted_at: string
          subtotal_amount: number
          total_amount: number
        }[]
      }
    }
    Enums: {
      order_fulfillment_type: "delivery" | "pickup"
      order_price_status: "needs_review" | "quoted"
      order_status:
        | "pending"
        | "payment_confirmed"
        | "preparing"
        | "ready_for_delivery"
        | "completed"
        | "canceled"
        | "delivering"
      payment_method: "bank_transfer"
      payment_status:
        | "waiting_transfer"
        | "transfer_submitted"
        | "confirmed"
        | "rejected"
        | "not_ready"
      store_admin_role: "owner" | "manager" | "staff"
      transfer_report_status: "submitted" | "verified" | "rejected"
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
  public: {
    Enums: {
      order_fulfillment_type: ["delivery", "pickup"],
      order_price_status: ["needs_review", "quoted"],
      order_status: [
        "pending",
        "payment_confirmed",
        "preparing",
        "ready_for_delivery",
        "completed",
        "canceled",
        "delivering",
      ],
      payment_method: ["bank_transfer"],
      payment_status: [
        "waiting_transfer",
        "transfer_submitted",
        "confirmed",
        "rejected",
        "not_ready",
      ],
      store_admin_role: ["owner", "manager", "staff"],
      transfer_report_status: ["submitted", "verified", "rejected"],
    },
  },
} as const
