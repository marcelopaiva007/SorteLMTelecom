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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      campanhas: {
        Row: {
          criado_em: string
          criterio_apuracao: string
          criterio_congelado_em: string
          data_apuracao: string
          digitos_cartela: number
          extracao_federal: Json | null
          fim: string
          ganhador_cliente_id: string | null
          id: string
          inicio: string
          nome: string
          numero_sorteado: number | null
          premio: string
          status: Database["public"]["Enums"]["status_campanha"]
        }
        Insert: {
          criado_em?: string
          criterio_apuracao: string
          criterio_congelado_em?: string
          data_apuracao: string
          digitos_cartela?: number
          extracao_federal?: Json | null
          fim: string
          ganhador_cliente_id?: string | null
          id?: string
          inicio: string
          nome: string
          numero_sorteado?: number | null
          premio: string
          status?: Database["public"]["Enums"]["status_campanha"]
        }
        Update: {
          criado_em?: string
          criterio_apuracao?: string
          criterio_congelado_em?: string
          data_apuracao?: string
          digitos_cartela?: number
          extracao_federal?: Json | null
          fim?: string
          ganhador_cliente_id?: string | null
          id?: string
          inicio?: string
          nome?: string
          numero_sorteado?: number | null
          premio?: string
          status?: Database["public"]["Enums"]["status_campanha"]
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_ganhador_cliente_id_fkey"
            columns: ["ganhador_cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          autoexcluido_em: string | null
          cpf_cnpj: string
          data_ativacao: string | null
          data_cancelamento: string | null
          erp_id: string
          id: string
          meses_em_dia: number
          nome: string
          sincronizado_em: string
          status: Database["public"]["Enums"]["status_cliente"]
          whatsapp: string | null
        }
        Insert: {
          autoexcluido_em?: string | null
          cpf_cnpj: string
          data_ativacao?: string | null
          data_cancelamento?: string | null
          erp_id: string
          id?: string
          meses_em_dia?: number
          nome: string
          sincronizado_em?: string
          status?: Database["public"]["Enums"]["status_cliente"]
          whatsapp?: string | null
        }
        Update: {
          autoexcluido_em?: string | null
          cpf_cnpj?: string
          data_ativacao?: string | null
          data_cancelamento?: string | null
          erp_id?: string
          id?: string
          meses_em_dia?: number
          nome?: string
          sincronizado_em?: string
          status?: Database["public"]["Enums"]["status_cliente"]
          whatsapp?: string | null
        }
        Relationships: []
      }
      codigos_acesso: {
        Row: {
          cliente_id: string
          codigo: string
          criado_em: string
          expira_em: string
          id: string
          usado_em: string | null
        }
        Insert: {
          cliente_id: string
          codigo: string
          criado_em?: string
          expira_em: string
          id?: string
          usado_em?: string | null
        }
        Update: {
          cliente_id?: string
          codigo?: string
          criado_em?: string
          expira_em?: string
          id?: string
          usado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codigos_acesso_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          atualizado_em: string
          chave: string
          descricao: string | null
          id: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          descricao?: string | null
          id?: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          descricao?: string | null
          id?: string
          valor?: string
        }
        Relationships: []
      }
      creditos: {
        Row: {
          campanha_id: string
          cliente_id: string
          criado_em: string
          evento_id: string
          id: string
          quantidade: number
        }
        Insert: {
          campanha_id: string
          cliente_id: string
          criado_em?: string
          evento_id: string
          id?: string
          quantidade: number
        }
        Update: {
          campanha_id?: string
          cliente_id?: string
          criado_em?: string
          evento_id?: string
          id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "creditos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creditos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          chave_idempotente: string
          cliente_id: string
          competencia: string | null
          id: string
          ocorrido_em: string
          payload_erp: Json
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Insert: {
          chave_idempotente: string
          cliente_id: string
          competencia?: string | null
          id?: string
          ocorrido_em?: string
          payload_erp?: Json
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Update: {
          chave_idempotente?: string
          cliente_id?: string
          competencia?: string | null
          id?: string
          ocorrido_em?: string
          payload_erp?: Json
          tipo?: Database["public"]["Enums"]["tipo_evento"]
        }
        Relationships: [
          {
            foreignKeyName: "eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_bloqueados: {
        Row: {
          chave_idempotente: string | null
          cliente_id: string | null
          detalhe: string | null
          id: string
          motivo: string
          ocorrido_em: string
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Insert: {
          chave_idempotente?: string | null
          cliente_id?: string | null
          detalhe?: string | null
          id?: string
          motivo: string
          ocorrido_em?: string
          tipo: Database["public"]["Enums"]["tipo_evento"]
        }
        Update: {
          chave_idempotente?: string | null
          cliente_id?: string | null
          detalhe?: string | null
          id?: string
          motivo?: string
          ocorrido_em?: string
          tipo?: Database["public"]["Enums"]["tipo_evento"]
        }
        Relationships: [
          {
            foreignKeyName: "eventos_bloqueados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      numeros: {
        Row: {
          campanha_id: string
          cliente_id: string
          escolhido_em: string
          id: string
          numero: number
          protocolo: string | null
        }
        Insert: {
          campanha_id: string
          cliente_id: string
          escolhido_em?: string
          id?: string
          numero: number
          protocolo?: string | null
        }
        Update: {
          campanha_id?: string
          cliente_id?: string
          escolhido_em?: string
          id?: string
          numero?: number
          protocolo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "numeros_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "numeros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          criado_em: string
          email: string | null
          id: string
          papel: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          email?: string | null
          id?: string
          papel?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          email?: string | null
          id?: string
          papel?: string
          user_id?: string
        }
        Relationships: []
      }
      regras: {
        Row: {
          bonus_a_cada_meses: number
          bonus_quantidade: number
          campanha_id: string
          carencia_dias: number
          id: string
          limite_meses: number | null
          quantidade: number
          teto_quantidade: number | null
          tipo_evento: Database["public"]["Enums"]["tipo_evento"]
        }
        Insert: {
          bonus_a_cada_meses?: number
          bonus_quantidade?: number
          campanha_id: string
          carencia_dias?: number
          id?: string
          limite_meses?: number | null
          quantidade: number
          teto_quantidade?: number | null
          tipo_evento: Database["public"]["Enums"]["tipo_evento"]
        }
        Update: {
          bonus_a_cada_meses?: number
          bonus_quantidade?: number
          campanha_id?: string
          carencia_dias?: number
          id?: string
          limite_meses?: number | null
          quantidade?: number
          teto_quantidade?: number | null
          tipo_evento?: Database["public"]["Enums"]["tipo_evento"]
        }
        Relationships: [
          {
            foreignKeyName: "regras_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      sessoes: {
        Row: {
          cliente_id: string
          criado_em: string
          expira_em: string
          token: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          expira_em: string
          token: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          expira_em?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      sincronizacoes: {
        Row: {
          clientes_lidos: number
          duplicados_barrados: number
          erro: string | null
          eventos_lidos: number
          id: string
          iniciado_em: string
          origem: string
          status: string
          terminado_em: string | null
        }
        Insert: {
          clientes_lidos?: number
          duplicados_barrados?: number
          erro?: string | null
          eventos_lidos?: number
          id?: string
          iniciado_em?: string
          origem?: string
          status?: string
          terminado_em?: string | null
        }
        Update: {
          clientes_lidos?: number
          duplicados_barrados?: number
          erro?: string | null
          eventos_lidos?: number
          id?: string
          iniciado_em?: string
          origem?: string
          status?: string
          terminado_em?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { _user_id?: string }; Returns: boolean }
    }
    Enums: {
      status_campanha: "rascunho" | "aberta" | "encerrada" | "apurada"
      status_cliente: "ativo" | "cancelado" | "suspenso"
      tipo_evento:
        | "assinatura"
        | "reativacao"
        | "quitacao_debito"
        | "mensalidade_em_dia"
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
      status_campanha: ["rascunho", "aberta", "encerrada", "apurada"],
      status_cliente: ["ativo", "cancelado", "suspenso"],
      tipo_evento: [
        "assinatura",
        "reativacao",
        "quitacao_debito",
        "mensalidade_em_dia",
      ],
    },
  },
} as const
