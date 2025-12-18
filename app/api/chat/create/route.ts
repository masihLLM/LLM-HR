import { createChat } from "@/lib/db";

export async function POST() {
  try {
    const chatId = await createChat();
    return Response.json({ chatId });
  } catch (error) {
    console.error("❌ API: Failed to create chat via /api/chat/create:", error);
    return new Response("Failed to create chat", { status: 500 });
  }
}


