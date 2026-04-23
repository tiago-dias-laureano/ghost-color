import { supabase } from "@/lib/supabaseClient";

type Cmd =
  | { type: "create_room"; name: string; roundsTotal?: number; isPublic?: boolean; password?: string }
  | { type: "join_room"; code: string; name: string; playerId?: string; password?: string }
  | { type: "room_info"; code: string }
  | { type: "list_public_rooms" }
  | { type: "start_game"; code: string; playerId: string; roundsTotal?: number }
  | { type: "submit_description"; code: string; playerId: string; description: string }
  | { type: "submit_guess"; code: string; playerId: string; guessedHex: string }
  | { type: "next_round"; code: string; playerId: string }
  | { type: "get_secret"; code: string; playerId: string }
  | { type: "get_state"; code: string; playerId: string; playerToken: string };

export async function gameCommand<T = any>(cmd: Cmd): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const resp = await fetch("/api/game", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(cmd),
  });

  const data = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) throw new Error(data?.message ?? `HTTP_${resp.status}`);
  if (!data?.ok) throw new Error(data?.message ?? "COMMAND_FAILED");
  return data as T;
}

