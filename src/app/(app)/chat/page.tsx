import { ChatView } from '@/components/chat/chat-view';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="section-num">07 · Chat</div>
        <h1 className="text-4xl tracking-tight">Ask the corpus a question</h1>
        <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
          The assistant answers strictly from passages it can cite. If the
          documents don’t cover something, it will say so plainly rather than
          improvise.
        </p>
      </header>

      <ChatView />
    </div>
  );
}
