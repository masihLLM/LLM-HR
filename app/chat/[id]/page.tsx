import { loadChat } from "@/lib/db";
import { Assistant } from "@/app/assistant";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

type ChatPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ starter?: string }>;
};

export default async function ChatPage({
  params,
  searchParams,
}: ChatPageProps) {
  const { id } = await params;
  const { starter } = (await searchParams) ?? {};

  try {
    const messages = await loadChat(id);
    return (
      <Assistant chatId={id} initialMessages={messages} starterPrompt={starter} />
    );
  } catch (error) {
    console.error(error);
    notFound();
  }
}
