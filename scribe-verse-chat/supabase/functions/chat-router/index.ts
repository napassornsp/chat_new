import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Version = "V1" | "V2" | "V3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action: "send" | "regenerate" = body.action ?? "send";
    const chatId: string = body.chatId;
    const version: Version = body.version;
    const text: string = body.text ?? body.lastUserText ?? "";

    if (!chatId || !version || !text) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify chat ownership
    const { data: chat, error: chatErr } = await supabase
      .from("chats")
      .select("id, user_id")
      .eq("id", chatId)
      .maybeSingle();
    if (chatErr || !chat || chat.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Chat not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure monthly credits are reset based on plan
    await supabase.rpc('reset_monthly_credits');

    // Fetch credits
    const { data: creditsRow, error: creditsErr } = await supabase
      .from("user_credits")
      .select("v1, v2, v3")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creditsErr) {
      return new Response(JSON.stringify({ error: creditsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create credits row if missing
    let v1 = creditsRow?.v1 ?? 10;
    let v2 = creditsRow?.v2 ?? 20;
    let v3 = creditsRow?.v3 ?? 30;

    const field = version === "V1" ? "v1" : version === "V2" ? "v2" : "v3";
    const remaining = field === "v1" ? v1 : field === "v2" ? v2 : v3;

    if (remaining <= 0) {
      return new Response(JSON.stringify({
        error: "Insufficient credits",
        credits: { v1, v2, v3 },
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credit (best-effort optimistic; DB is per-user scoped)
    const newValues: Record<string, number> = { v1, v2, v3 } as any;
    newValues[field] = remaining - 1;

    const { data: updatedCredits, error: updErr } = await supabase
      .from("user_credits")
      .upsert({ user_id: user.id, ...newValues })
      .select("v1, v2, v3")
      .single();

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a placeholder assistant response based on version
    const generatedText = `Hello! This is a response from ChatBot ${version}. I'm here to help you with any questions. In a real implementation, this would connect to our advanced AI backend.`;

    const assistantContent = {
      text: generatedText,
      version,
      meta: { action, echoOf: text }
    };

    const { data: insertedMsg, error: insertErr } = await supabase
      .from("messages")
      .insert({
        chat_id: chatId,
        user_id: user.id,
        role: "assistant",
        content: assistantContent,
      })
      .select("id, chat_id, user_id, role, content, created_at")
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ assistant: insertedMsg, credits: updatedCredits }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chat-router error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
