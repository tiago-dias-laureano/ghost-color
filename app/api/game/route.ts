import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function OPTIONS() {
  // Same-origin endpoint; keep permissive for dev.
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const body = await req.text();

    const resp = await fetch(`${supabaseUrl}/functions/v1/ghost-color-game`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : {}),
      },
      body,
    });

    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as any)?.message ?? "PROXY_ERROR" }, { status: 500 });
  }
}

