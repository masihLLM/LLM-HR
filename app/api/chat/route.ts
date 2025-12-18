import {
  streamText,
  UIMessage,
  convertToModelMessages,
  validateUIMessages,
  TypeValidationError,
} from "ai";
import { createOpenAI } from '@ai-sdk/openai';
import {
  type InferUITools,
  type UIDataTypes,
  stepCountIs,
} from 'ai';
import { loadChat, saveChat, createChat } from '@/lib/db';
import { hrTools, setToolContext, ToolContext } from '@/lib/hr/tools';
import { getAuthUser } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db';

const tools = hrTools;

export type ChatTools = InferUITools<typeof tools>;

export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

import { getEffectiveOpenAIConfig } from '@/lib/services/settings';

const openai = createOpenAI();

// GET handler for resuming streams
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('chatId is required', { status: 400 });
  }

  try {
    const messages = await loadChat(chatId);
    return Response.json({ messages });
  } catch (error) {
    console.error('❌ API GET: Failed to load chat:', error);
    return new Response('Chat not found', { status: 404 });
  }
}

export async function POST(req: Request) {
  // Extract JWT and authenticate user
  const authUser = getAuthUser(req);
  if (!authUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid JWT token' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get user from database to verify role
  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { id: true, role: true },
  });

  if (!user) {
    return new Response('Unauthorized: User not found', { status: 401 });
  }

  // Set tool context for HR tools
  const toolContext: ToolContext = {
    userId: user.id,
    role: user.role,
  };
  setToolContext(toolContext);

  const body = await req.json();
  const messages = (body?.messages ?? []) as ChatMessage[];
  const chatId = (body?.id ?? body?.chatId) as string | undefined;

  console.log('🔍 API: Received request with chatId:', chatId, 'and', messages.length, 'messages');

  // Determine the chatId to use
  let currentChatId: string;
  let isNewChat = false;
  
  if (!chatId) {
    // No chatId provided - create a new chat
    try {
      currentChatId = await createChat();
      isNewChat = true;
      console.log('📝 API: Created new chat with ID:', currentChatId);
    } catch (error) {
      console.error('❌ API: Failed to create new chat:', error);
      return new Response('Failed to create chat', { status: 500 });
    }
  } else {
    // ChatId provided - verify it exists in database
    try {
      await loadChat(chatId);
      currentChatId = chatId;
      console.log('📝 API: Using existing chat with ID:', currentChatId);
    } catch (error) {
      // ChatId provided but doesn't exist - create a new chat instead
      console.log('⚠️ API: Provided chatId does not exist, creating new chat');
      try {
        currentChatId = await createChat();
        isNewChat = true;
        console.log('📝 API: Created new chat with ID:', currentChatId);
      } catch (createError) {
        console.error('❌ API: Failed to create new chat:', createError);
        return new Response('Failed to create chat', { status: 500 });
      }
    }
  }

  // Load previous messages from database
  let previousMessages: UIMessage[] = [];
  if (!isNewChat) {
    try {
      previousMessages = await loadChat(currentChatId);
      console.log('📚 API: Loaded', previousMessages.length, 'previous messages from database');
    } catch (error) {
      console.error('❌ API: Failed to load chat:', error);
      // If chat doesn't exist, start with empty history
      previousMessages = [];
    }
  } else {
    console.log('📚 API: New chat, starting with empty message history');
  }

  // Append new message to previous messages
  const allMessages = [...previousMessages, ...messages];
  console.log('📝 API: Total messages to process:', allMessages.length);

  // Validate loaded messages against tools
  let validatedMessages: UIMessage[];
  try {
    validatedMessages = await validateUIMessages({
      messages: allMessages,
      tools: tools as any,
    });
  } catch (error) {
    if (error instanceof TypeValidationError) {
      console.error('⚠️ API: Database messages validation failed:', error);
      // Start with empty history if validation fails
      validatedMessages = messages;
    } else {
      throw error;
    }
  }

  const effective = await getEffectiveOpenAIConfig();
  const result = streamText({
    model: createOpenAI({ baseURL: effective.baseURL, apiKey: effective.apiKey }).chat("gpt-oss-120b"),
    messages: convertToModelMessages(validatedMessages),
    stopWhen: stepCountIs(5),
    tools,
    system: `You are an HR Admin Assistant, helping manage employee records, contracts, attendance, payroll, and administrative tasks.

Your role: ${user.role}

Available tools:
- Employee management: createEmployee, updateEmployee, getEmployee, archiveEmployee, reactivateEmployee
- Contract management: createContract, updateContract, getContract, terminateContract
- Administrative letters: generateLetter, getLetters
- Attendance tracking: recordAttendance, updateAttendance, getAttendance, approveLeave, requestLeave
- Payroll: calculatePayroll, getPayroll, approvePayroll, paySalary
- Benefits: addBenefit, updateBenefit, getBenefits
- Audit logs: getAuditLogs (HR Admin only)

Guidelines:
- Use natural language to understand user requests (e.g., "Add employee Ali with salary 10M toman")
- Always verify permissions before performing actions
- For date fields, use ISO format (YYYY-MM-DD or full ISO datetime)
- When creating records, provide clear confirmation of what was created
- For payroll calculations, automatically calculate overtime from attendance records
- Be helpful and explain what actions you're taking
- If a user lacks permission for an action, clearly explain why

Remember: Your permissions are based on your role (${user.role}). Some actions may require HR_Admin or HR_Manager roles.`,
  });

  // ensure stream runs to completion even if client aborts
  result.consumeStream();

  const response = result.toUIMessageStreamResponse({
    originalMessages: validatedMessages,
    // generate a stable server-side id when missing/blank (AI SDK v5)
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages }) => {
      // normalize empty string ids to undefined so generateMessageId kicks in next round
      const normalized = messages.map((m: any) => ({
        ...m,
        id: m?.id && String(m.id).length > 0 ? m.id : crypto.randomUUID(),
      }));

      // de-duplicate by id while preserving order (keeps last occurrence)
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (let i = normalized.length - 1; i >= 0; i--) {
        const msg = normalized[i];
        if (!seen.has(msg.id)) {
          seen.add(msg.id);
          deduped.unshift(msg);
        }
      }

      console.log('💾 API: onFinish called with', messages.length, 'messages (deduped to', deduped.length, '), saving to chatId:', currentChatId);
      try {
        await saveChat(currentChatId, deduped as any);
        console.log('✅ API: Successfully saved chat to database');
      } catch (error) {
        console.error('❌ API: Failed to save chat:', error);
      }
    },
  });

  // Add chatId to response headers if it was newly created (for client-side redirect)
  // This includes cases where chatId was provided but didn't exist
  if (isNewChat) {
    response.headers.set('X-Chat-Id', currentChatId);
  }

  return response;
}