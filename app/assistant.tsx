"use client";

import * as React from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { UIMessage } from "ai";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchModal } from "@/components/search-modal";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { SettingsModal } from "@/components/settings-modal";
import { ArtifactProvider, useArtifacts } from "@/lib/contexts/artifact-context";
import { ArtifactPane } from "@/components/artifacts/artifact-pane";
import { useRouter } from "next/navigation";
import { ConversationThread } from "@/components/assistant-ui/big-thread-migration/conversation-thread";
import { getToken } from "@/lib/auth/client";

export const Assistant = ({ 
  chatId: propChatId, 
  initialMessages = [],
  starterPrompt,
}: { 
  chatId?: string; 
  initialMessages?: UIMessage[];
  starterPrompt?: string | null;
}) => {
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [currentChatId, setCurrentChatId] = React.useState<string | undefined>(propChatId);
  const router = useRouter();
  const [pendingStarter, setPendingStarter] = React.useState<string | null>(starterPrompt ?? null);
  
  // Update currentChatId when propChatId changes (but only if it's a new chatId)
  React.useEffect(() => {
    if (propChatId && propChatId !== currentChatId) {
      setCurrentChatId(propChatId);
    }
  }, [propChatId, currentChatId]);

  React.useEffect(() => {
    setPendingStarter(starterPrompt ?? null);
  }, [starterPrompt]);
  
  const runtime = useChatRuntime({
    id: currentChatId,
    messages: initialMessages,
  });

  React.useEffect(() => {
    if (!pendingStarter) return;
    const state = runtime.thread.getState();

    if (state.messages.length > 0) {
      setPendingStarter(null);
      if (propChatId) {
        router.replace(`/chat/${propChatId}`);
      }
      return;
    }

    runtime.thread.composer.setText(pendingStarter);
    runtime.thread.composer.send();
    setPendingStarter(null);
    if (propChatId) {
      router.replace(`/chat/${propChatId}`);
    }
  }, [pendingStarter, runtime, propChatId, router]);

  const handleChatSelect = (chatId: string) => {
    if (chatId === 'new') {
      // Handle new chat creation - redirect to /chat page
      router.push('/chat');
    } else {
      // Navigate to existing chat using Next.js router
      router.push(`/chat/${chatId}`);
    }
  };

  return (
    <ArtifactProvider>
      <AssistantInner 
        runtime={runtime}
        chatId={propChatId}
        searchModalOpen={searchModalOpen}
        setSearchModalOpen={setSearchModalOpen}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        handleChatSelect={handleChatSelect}
      />
    </ArtifactProvider>
  );
};

const AssistantInner: React.FC<{
  runtime: ReturnType<typeof useChatRuntime>;
  chatId?: string;
  searchModalOpen: boolean;
  setSearchModalOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  handleChatSelect: (chatId: string) => void;
}> = ({ runtime, chatId, searchModalOpen, setSearchModalOpen, settingsOpen, setSettingsOpen, handleChatSelect }) => {
  const { currentArtifact, isPaneOpen, closePane, paneWidth, setPaneWidth } = useArtifacts();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5 relative">
          <AppSidebar />
          <SidebarInset className={isPaneOpen ? "lg:mr-0" : ""}>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#">
                      
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage></BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchModalOpen(true)}
                  className="h-8 w-8"
                >
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search chats</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  className="h-8 w-8"
                >
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
                <ThemeToggle />
              </div>
            </header>
            <div className="flex-1 overflow-hidden">
              <ConversationThread />
            </div>
          </SidebarInset>
          
          {/* Artifact Pane */}
          <ArtifactPane
            artifact={currentArtifact}
            isOpen={isPaneOpen}
            onClose={closePane}
            onResize={setPaneWidth}
            paneWidth={paneWidth}
          />
        </div>
      </SidebarProvider>
      <SearchModal 
        open={searchModalOpen} 
        onOpenChange={setSearchModalOpen}
        onChatSelect={handleChatSelect}
      />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </AssistantRuntimeProvider>
  );
};
