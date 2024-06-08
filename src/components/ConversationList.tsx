import { useRef, createRef } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids';
import { ConversationMembership } from '../../convex/aiTown/conversationMembership';
import { ServerGame } from '../hooks/serverGame.ts';
import {Messages} from './Messages.tsx';


export default function ConversationList({
    worldId,
    engineId,
    game,
    height,
  }: {
    worldId: Id<'worlds'>;
    engineId: Id<'engines'>;
    game: ServerGame;
    height: number;
  }) {
    const maxHeight = height - 120;
    const conversations = [...game.world.conversations.values()]
    
    const activeConversations = conversations
      .filter((c)=> [...c.participants.keys()]
        .map((p : GameId<'players'>)=> 
          c.participants.get(p)?.status.kind
          )
        .filter((s)=> 
          s==='participating'
          )
        .length===2
        );

    // Create an array of refs to scroll in each conversation
    const refs = useRef([]);
    refs.current = activeConversations.map((_, i) => refs.current[i] ?? createRef());

    return (
        <div className={`flex max-w-full overflow-auto pt-4`} style={{maxHeight:maxHeight+"px"}}>
          {activeConversations.map((c,index) =>
              <div 
                className="flex flex-col items-center max-w-[350px] max-h-full overflow-auto" 
                key={c.id} 
                ref={refs.current[index]}>
                  <Messages
                    worldId={worldId}
                    engineId={engineId}
                    conversation={{ kind: 'active', doc: c }}
                    inConversationWithMe={false}
                    scrollViewRef={refs.current[index]}
                    asOverview={true}
                  />
              </div>
            )}
        </div>
    )
  }