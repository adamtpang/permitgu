"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

export function createBrowserSupabase() {
  const env = supabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.anonKey);
}
