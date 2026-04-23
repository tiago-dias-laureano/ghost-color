import { supabase } from "@/lib/supabaseClient";

type Cmd =
  | { type: "create_room"; name: string; roundsTotal?: number }
  | { type: "join_room"; code: string; name: string; playerId?: string }
  | { type: "start_game"; code: string; playerId: string; roundsTotal?: number }
  | { type: "submit_description"; code: string; playerId: string; description: string }
  | { type: "submit_guess"; code: string; playerId: string; guessedHex: string }
  | { type: "next_round"; code: string; playerId: string }
  | { type: "get_secret"; code: string; playerId: string }
  | { type: "get_state"; code: string; playerId: string; playerToken: string };

export async function gameCommand<T = any>(cmd: Cmd): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ghost-color-game", { body: cmd });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message ?? "COMMAND_FAILED");
  return data as T;
}

