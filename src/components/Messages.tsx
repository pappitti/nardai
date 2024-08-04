import clsx from 'clsx';
import { Doc, Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MessageInput } from './MessageInput';
import { Player } from '../../convex/aiTown/player';
import { Conversation } from '../../convex/aiTown/conversation';
import { useEffect, useRef } from 'react';

export function Messages({
  worldId,
  engineId,
  conversation,
  inConversationWithMe,
  humanPlayer,
  scrollViewRef,
  asOverview
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  conversation:
    | { kind: 'active'; doc: Conversation }
    | { kind: 'archived'; doc: Doc<'archivedConversations'> };
  inConversationWithMe: boolean;
  humanPlayer?: Player;
  scrollViewRef: React.RefObject<HTMLDivElement>;
  asOverview?: boolean;
}) {
  const humanPlayerId = humanPlayer?.id;
  const descriptions = useQuery(api.world.gameDescriptions, { worldId });
  const messages = useQuery(api.messages.listMessages, {
    worldId,
    conversationId: conversation.doc.id,
  });
  let currentlyTyping = conversation.kind === 'active' ? conversation.doc.isTyping : undefined;
  if (messages !== undefined && currentlyTyping) {
    if (messages.find((m) => m.messageUuid === currentlyTyping!.messageUuid)) {
      currentlyTyping = undefined;
    }
  }
  const currentlyTypingName =
    currentlyTyping &&
    descriptions?.playerDescriptions.find((p) => p.playerId === currentlyTyping?.playerId)?.name;

  const scrollView = scrollViewRef.current;
  const isScrolledToBottom = useRef(false);
  useEffect(() => {
    if (!scrollView) return undefined;

    const onScroll = () => {
      isScrolledToBottom.current = !!(
        scrollView && scrollView.scrollHeight - scrollView.scrollTop - 50 <= scrollView.clientHeight
      );
    };
    scrollView.addEventListener('scroll', onScroll);
    return () => scrollView.removeEventListener('scroll', onScroll);
  }, [scrollView]);
  useEffect(() => {
    if (isScrolledToBottom.current) {
      scrollViewRef.current?.scrollTo({
        top: scrollViewRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, currentlyTyping]);

  if (messages === undefined) {
    return null;
  }
  if (messages.length === 0 && !inConversationWithMe) {
    return null;
  }
  const messageNodes: { time: number; node: React.ReactNode }[] = messages.map((m) => {
    const node = (
      <div key={`text-${m._id}`} className="leading-tight mb-4">
        <div className="flex gap-4 justify-center text-slate-700 mb-2">
          <span className="uppercase">{m.authorName}</span>
          <time dateTime={m._creationTime.toString()}>
            {new Date(m._creationTime).toLocaleString()}
          </time>
        </div>
        <div className={m.author === humanPlayerId ? 'bubble-mine':'bubble'}>
          <p className={asOverview?"overview-bubble":""}>{m.text}</p>
        </div>
      </div>
    );
    return { node, time: m._creationTime };
  });
  const lastMessageTs = messages.map((m) => m._creationTime).reduce((a, b) => Math.max(a, b), 0);

  const membershipNodes: typeof messageNodes = [];
  if (conversation.kind === 'active') {
    if (!asOverview){
      for (const [playerId, m] of conversation.doc.participants) {
        const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
          ?.name;
        let started;
        if (m.status.kind === 'participating') {
          started = m.status.started;
        }
        if (started) {
          membershipNodes.push({
            node: (
              <div key={`joined-${playerId}`} className="leading-tight mb-4">
                <p className="text-white text-center">{playerName} joined the conversation.</p>
              </div>
            ),
            time: started,
          });
        }
      }
    }
    else {
      const participants : [string|undefined,number][] = [...conversation.doc.participants.keys()]
        .map((pId)=>[
          descriptions?.playerDescriptions.find((p) => p.playerId === pId)?.name,
          (conversation.doc.participants.get(pId)?.status as { kind: "participating"; started: number }).started // We know this is a participating status given how the conversation is filtered in ConversationList
        ]);
      membershipNodes.push({
        node: (
          <div key={`convo-header-${conversation.doc.id}`} className="box overview-box w-full sticky top-0">
            <h2 className="text-slate-400 text-lg text-center">{participants.map((p)=>p[0]).join(' and ')}</h2>
          </div>
        ),
        time: participants[0][1]??0,
      });
    }
  } else {
    for (const playerId of conversation.doc.participants) {
      const playerName = descriptions?.playerDescriptions.find((p) => p.playerId === playerId)
        ?.name;
      const started = conversation.doc.created;
      if (!asOverview){
        membershipNodes.push({
          node: (
            <div key={`joined-${playerId}`} className="leading-tight mb-4">
              <p className="text-white text-center">{playerName} joined the conversation.</p>
            </div>
          ),
          time: started,
        });
      };
      const ended = conversation.doc.ended;
      membershipNodes.push({
        node: (
          <div key={`left-${playerId}`} className="leading-tight mb-4">
            <p className="text-white text-center">{playerName} left the conversation.</p>
          </div>
        ),
        // Always sort all "left" messages after the last message.
        // TODO: We can remove this once we want to support more than two participants per conversation.
        time: Math.max(lastMessageTs + 1, ended),
      });
    }
  }
  const nodes = [...messageNodes, ...membershipNodes];
  nodes.sort((a, b) => a.time - b.time);
  return (
    <div className="chats text-base sm:text-sm">
      <div className="text-black">
        {nodes.length > 0 && nodes.map((n) => n.node)}
        {currentlyTyping && currentlyTyping.playerId !== humanPlayerId && (
          <div key="typing" className="leading-tight mb-6">
            <div className="flex gap-4 justify-center mb-2">
              <span className="uppercase">{currentlyTypingName}</span>
              <time dateTime={currentlyTyping.since.toString()}>
                {new Date(currentlyTyping.since).toLocaleString()}
              </time>
            </div>
            <div className={'bubble'}>
              <p>
                <i>typing...</i>
              </p>
            </div>
          </div>
        )}
        {humanPlayer && inConversationWithMe && conversation.kind === 'active' && (
          <MessageInput
            worldId={worldId}
            engineId={engineId}
            conversation={conversation.doc}
            humanPlayer={humanPlayer}
          />
        )}
      </div>
    </div>
  );
}
