import { useRef, createRef } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { GameId } from '../../convex/aiTown/ids';
import { ConversationMembership } from '../../convex/aiTown/conversationMembership';
import { ServerGame } from '../hooks/serverGame.ts';
import {Messages} from './Messages.tsx';



export default function KeywordTracker({
    worldId,
    engineId,
    game,
    height,
    keyword
  }: {
    worldId: Id<'worlds'>;
    engineId: Id<'engines'>;
    game: ServerGame;
    height: number;
    keyword: string;
  }) {
    const maxHeight = height - 120;

    const messages = useQuery(api.messages.findKeyword , {
      worldId,
      text: keyword
    });

    // const conversations = [...game.world.conversations.values()]
    
    // const activeConversations = conversations
    //   .filter((c)=> [...c.participants.keys()]
    //     .map((p : GameId<'players'>)=> 
    //       c.participants.get(p)?.status.kind
    //       )
    //     .filter((s)=> 
    //       s==='participating'
    //       )
    //     .length===2
    //     );

    // // Create an array of refs to scroll in each conversation
    // const refs = useRef([]);
    // refs.current = activeConversations.map((_, i) => refs.current[i] ?? createRef());

    return (
        <div className={`flex flex-nowrap justify-start max-w-full overflow-auto pt-4 gap-1`} style={{maxHeight:maxHeight+"px"}}>
          {messages &&
            messages.map((m,index) =>
              <div 
                className="flex items-center max-w-[350px] min-w-[250px] max-h-full overflow-auto" 
                key={`message-${m._id}`}
              >
              {m.authorName}, {new Date(m._creationTime).toLocaleString()}, {m.text}
              </div>
            )}
        </div>
    )
  }