import { listChats, deleteChat, renameChat } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    const chats = await listChats(limit, offset);
    return Response.json({ 
      chats: chats.chats,
      pagination: {
        page,
        limit,
        total: chats.total,
        hasMore: offset + limit < chats.total
      }
    });
  } catch (error) {
    console.error('Failed to list chats:', error);
    return Response.json({ chats: [] }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });
  try {
    await deleteChat(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete chat:', error);
    return new Response('Failed to delete', { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = body?.id as string | undefined;
    const title = body?.title as string | undefined;
    if (!id || typeof title !== 'string' || title.trim().length === 0) {
      return new Response('Invalid payload', { status: 400 });
    }
    await renameChat(id, title.trim());
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Failed to rename chat:', error);
    return new Response('Failed to rename', { status: 500 });
  }
}
