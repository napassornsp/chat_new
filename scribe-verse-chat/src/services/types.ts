// src/services/types.ts
export type BotVersion = "V1" | "V2" | "V3";

export type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: any;
  created_at: string;
};

export type Chat = {
  id: string;
  user_id: string;
  title: string;
  last_message?: string | null;
  messages_count?: number | null;
  created_at: string;
  updated_at?: string;
};

// IMPORTANT: make Credits an object with a `remaining` field.
export type Credits = {
  remaining: number;
};
