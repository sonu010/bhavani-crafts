export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_generations: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          input_hash: string
          input_tokens: number | null
          model: string
          output_json: Json | null
          output_tokens: number | null
          prompt_version: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["ai_generation_status"]
          task_type: Database["public"]["Enums"]["ai_task_type"]
          usd_cost: number | null
          validation_error: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          input_hash: string
          input_tokens?: number | null
          model: string
          output_json?: Json | null
          output_tokens?: number | null
          prompt_version: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          task_type: Database["public"]["Enums"]["ai_task_type"]
          usd_cost?: number | null
          validation_error?: string | null
          validation_status: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          input_hash?: string
          input_tokens?: number | null
          model?: string
          output_json?: Json | null
          output_tokens?: number | null
          prompt_version?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          task_type?: Database["public"]["Enums"]["ai_task_type"]
          usd_cost?: number | null
          validation_error?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_definitions: {
        Row: {
          applies_to_category_id: string | null
          created_at: string
          id: string
          is_filterable: boolean
          name: string
          options_json: Json | null
          slug: string
          sort_order: number
          type: Database["public"]["Enums"]["attribute_type"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          applies_to_category_id?: string | null
          created_at?: string
          id?: string
          is_filterable?: boolean
          name: string
          options_json?: Json | null
          slug: string
          sort_order?: number
          type: Database["public"]["Enums"]["attribute_type"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_category_id?: string | null
          created_at?: string
          id?: string
          is_filterable?: boolean
          name?: string
          options_json?: Json | null
          slug?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["attribute_type"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_definitions_applies_to_category_id_fkey"
            columns: ["applies_to_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          checkpoint: Json | null
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          payload_json: Json | null
          progress: number
          result_json: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          total: number
        }
        Insert: {
          checkpoint?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          payload_json?: Json | null
          progress?: number
          result_json?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
        }
        Update: {
          checkpoint?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          payload_json?: Json | null
          progress?: number
          result_json?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          image_url: string | null
          meta_description: string | null
          meta_title: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      import_run_rows: {
        Row: {
          action: Database["public"]["Enums"]["import_action"] | null
          applied_at: string | null
          error_message: string | null
          id: string
          import_run_id: string
          raw_json: Json
          row_number: number
          sku: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["import_action"] | null
          applied_at?: string | null
          error_message?: string | null
          id?: string
          import_run_id: string
          raw_json: Json
          row_number: number
          sku?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["import_action"] | null
          applied_at?: string | null
          error_message?: string | null
          id?: string
          import_run_id?: string
          raw_json?: Json
          row_number?: number
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_run_rows_import_run_id_fkey"
            columns: ["import_run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error_count: number
          filename: string | null
          finished_at: string | null
          id: string
          status: Database["public"]["Enums"]["job_status"]
          success_count: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          success_count?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_count?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["job_status"]
          success_count?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          data_json: Json | null
          id: string
          job_id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          data_json?: Json | null
          id?: string
          job_id: string
          level: string
          message: string
        }
        Update: {
          created_at?: string
          data_json?: Json | null
          id?: string
          job_id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_inr: number
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          sku: string
          unit_price_inr: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_inr: number
          name: string
          order_id: string
          product_id?: string | null
          quantity: number
          sku: string
          unit_price_inr: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          line_total_inr?: number
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          sku?: string
          unit_price_inr?: number
          variant_id?: string | null
          variant_label?: string | null
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
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refunded_at: string | null
          shipping_address: Json
          shipping_inr: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_inr: number
          total_inr: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          shipping_address: Json
          shipping_inr?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_inr: number
          total_inr: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refunded_at?: string | null
          shipping_address?: Json
          shipping_inr?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_inr?: number
          total_inr?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          attribute_id: string
          created_at: string
          product_id: string
          updated_at: string
          value_boolean: boolean | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          attribute_id: string
          created_at?: string
          product_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          attribute_id?: string
          created_at?: string
          product_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          blur_data_url: string | null
          created_at: string
          deleted_at: string | null
          height: number | null
          id: string
          license_status: Database["public"]["Enums"]["license_status"]
          license_verified_at: string | null
          license_verified_by: string | null
          product_id: string
          sort_order: number
          source: Database["public"]["Enums"]["image_source"]
          source_attribution: string | null
          source_url: string | null
          storage_path: string | null
          updated_at: string
          url: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          blur_data_url?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          license_status?: Database["public"]["Enums"]["license_status"]
          license_verified_at?: string | null
          license_verified_by?: string | null
          product_id: string
          sort_order?: number
          source?: Database["public"]["Enums"]["image_source"]
          source_attribution?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          url: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          blur_data_url?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          license_status?: Database["public"]["Enums"]["license_status"]
          license_verified_at?: string | null
          license_verified_by?: string | null
          product_id?: string
          sort_order?: number
          source?: Database["public"]["Enums"]["image_source"]
          source_attribution?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_license_verified_by_fkey"
            columns: ["license_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          created_at: string
          id: string
          option_id: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          id: string
          name: string
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          compare_at_price_inr: number | null
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          name: string | null
          price_inr: number | null
          product_id: string
          sku: string
          sort_order: number
          stock_quantity: number | null
          stock_status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
        }
        Insert: {
          compare_at_price_inr?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name?: string | null
          price_inr?: number | null
          product_id: string
          sku: string
          sort_order?: number
          stock_quantity?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Update: {
          compare_at_price_inr?: number | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name?: string | null
          price_inr?: number | null
          product_id?: string
          sku?: string
          sort_order?: number
          stock_quantity?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allow_backorder: boolean
          base_price_inr: number | null
          canonical_url: string | null
          category_id: string | null
          compare_at_price_inr: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          fts: unknown
          id: string
          is_featured: boolean
          is_published: boolean
          low_stock_threshold: number
          max_order_qty: number | null
          meta_description: string | null
          meta_title: string | null
          min_order_qty: number
          name: string
          reserved_quantity: number
          review_status: Database["public"]["Enums"]["review_status"]
          short_description: string | null
          sku: string
          slug: string
          source: Database["public"]["Enums"]["product_source"]
          source_url: string | null
          stock_quantity: number | null
          stock_status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_backorder?: boolean
          base_price_inr?: number | null
          canonical_url?: string | null
          category_id?: string | null
          compare_at_price_inr?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fts?: unknown
          id?: string
          is_featured?: boolean
          is_published?: boolean
          low_stock_threshold?: number
          max_order_qty?: number | null
          meta_description?: string | null
          meta_title?: string | null
          min_order_qty?: number
          name: string
          reserved_quantity?: number
          review_status?: Database["public"]["Enums"]["review_status"]
          short_description?: string | null
          sku: string
          slug: string
          source?: Database["public"]["Enums"]["product_source"]
          source_url?: string | null
          stock_quantity?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_backorder?: boolean
          base_price_inr?: number | null
          canonical_url?: string | null
          category_id?: string | null
          compare_at_price_inr?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          fts?: unknown
          id?: string
          is_featured?: boolean
          is_published?: boolean
          low_stock_threshold?: number
          max_order_qty?: number | null
          meta_description?: string | null
          meta_title?: string | null
          min_order_qty?: number
          name?: string
          reserved_quantity?: number
          review_status?: Database["public"]["Enums"]["review_status"]
          short_description?: string | null
          sku?: string
          slug?: string
          source?: Database["public"]["Enums"]["product_source"]
          source_url?: string | null
          stock_quantity?: number | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          updated_by?: string | null
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
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["profile_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["profile_role"]
          updated_at?: string
        }
        Relationships: []
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          query: string
          result_count: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          result_count: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          result_count?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_synonyms: {
        Row: {
          created_at: string
          id: string
          synonyms: string[]
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          synonyms?: string[]
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          synonyms?: string[]
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      variant_option_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_option_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      category_with_descendants: {
        Row: {
          ancestor_id: string | null
          descendant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      attribute_value_counts: {
        Args: never
        Returns: {
          attribute_id: string
          value_count: number
        }[]
      }
      create_anon_order: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_items: Json
          p_notes: string
          p_shipping: Json
          p_shipping_inr: number
          p_subtotal_inr: number
          p_total_inr: number
        }
        Returns: {
          id: string
          order_number: string
        }[]
      }
      generate_order_number: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_pending_anon_order: { Args: { p_order_id: string }; Returns: boolean }
      products_status_counts: {
        Args: never
        Returns: {
          count: number
          review_status: Database["public"]["Enums"]["review_status"]
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tag_product_counts: {
        Args: never
        Returns: {
          product_count: number
          tag_id: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      ai_generation_status:
        | "proposed"
        | "accepted"
        | "rejected"
        | "semantic_fail"
      ai_task_type:
        | "category_suggest"
        | "tag_suggest"
        | "alt_text"
        | "description_draft"
        | "duplicate_detect"
        | "csv_cleanup"
        | "search_synonym_mine"
      attribute_type: "text" | "number" | "boolean" | "select"
      image_source:
        | "justkraft_seed"
        | "admin_upload"
        | "owner_provided"
        | "third_party_licensed"
        | "unknown"
      import_action: "create" | "update" | "skip" | "error"
      job_status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
      license_status:
        | "unverified"
        | "owned"
        | "licensed"
        | "public_domain"
        | "disputed"
        | "removed"
      order_status:
        | "pending_payment"
        | "paid"
        | "failed"
        | "cancelled"
        | "refunded"
      product_source: "manual" | "justkraft_seed" | "csv_import" | "ai_assisted"
      profile_role: "owner" | "admin" | "editor" | "viewer"
      review_status:
        | "draft"
        | "needs_review"
        | "ready_to_publish"
        | "published"
        | "archived"
      stock_status:
        | "in_stock"
        | "low_stock"
        | "out_of_stock"
        | "made_to_order"
        | "unknown"
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
      ai_generation_status: [
        "proposed",
        "accepted",
        "rejected",
        "semantic_fail",
      ],
      ai_task_type: [
        "category_suggest",
        "tag_suggest",
        "alt_text",
        "description_draft",
        "duplicate_detect",
        "csv_cleanup",
        "search_synonym_mine",
      ],
      attribute_type: ["text", "number", "boolean", "select"],
      image_source: [
        "justkraft_seed",
        "admin_upload",
        "owner_provided",
        "third_party_licensed",
        "unknown",
      ],
      import_action: ["create", "update", "skip", "error"],
      job_status: ["queued", "running", "succeeded", "failed", "cancelled"],
      license_status: [
        "unverified",
        "owned",
        "licensed",
        "public_domain",
        "disputed",
        "removed",
      ],
      order_status: [
        "pending_payment",
        "paid",
        "failed",
        "cancelled",
        "refunded",
      ],
      product_source: ["manual", "justkraft_seed", "csv_import", "ai_assisted"],
      profile_role: ["owner", "admin", "editor", "viewer"],
      review_status: [
        "draft",
        "needs_review",
        "ready_to_publish",
        "published",
        "archived",
      ],
      stock_status: [
        "in_stock",
        "low_stock",
        "out_of_stock",
        "made_to_order",
        "unknown",
      ],
    },
  },
} as const

