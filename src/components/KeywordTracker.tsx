import React, { useRef, createRef } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { GameId } from '../../convex/aiTown/ids';
import { Conversation } from '../../convex/aiTown/conversation';
import { Player } from '../../convex/aiTown/player';
import { ServerGame } from '../hooks/serverGame.ts';
import {Messages} from './Messages.tsx';

function unionWithoutDuplicates(list1: string[], list2: string[]): string[] {
  const set = new Set([...list1, ...list2]);
  return Array.from(set);
}

export default function KeywordTracker({
    worldId,
    engineId,
    game,
    height,
    width,
    keyword
  }: {
    worldId: Id<'worlds'>;
    engineId: Id<'engines'>;
    game: ServerGame;
    height: number;
    width: number;
    keyword: string;
  }) {
  

    const messages = useQuery(api.messages.findKeyword , {
      worldId,
      text: keyword
    });

    const conversations = useQuery(api.aiTown.conversation.listArchivedConversations, {worldId});

    const kwConversations = messages?.map((m)=>m.conversationId)??[];

    const archivedPlayers = useQuery(api.aiTown.player.listArchivedPlayers, {worldId})?.map((p)=>p.id)??[];

    const worldPlayers = [...game.world.players.values()].map((p:Player)=>p.id)

    const allPlayers = unionWithoutDuplicates(worldPlayers, archivedPlayers)
      .map((pId)=> {
        return {
          pId,
          name: game.playerDescriptions.get(pId as GameId<'players'>)?.name ?? "Unknown",
          conversations: conversations?.filter((c)=>c.participants.includes(pId))??[],
          knowsAfter: conversations?.filter((c)=>
            c.participants.includes(pId) && kwConversations.includes(c.id)
            )
            .map((c)=>c.created)
            .sort()
          }
        }
      );

    const maxHeight = height - 120;
    const margin = { top: 20, right: 50, bottom: 30, left: 100 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight =maxHeight - margin.top - margin.bottom;
  
    const minTime = Math.min(...conversations?.map(c => c.created)??[]);
    const maxTime = Math.max(...conversations?.map(c => c.created)??[]);
    const totalTime = maxTime - minTime;
  
    const scaleX = (time: number) => ((time-minTime) / totalTime) * innerWidth;
    const scaleY = (index: number) => ((index + 0.5)/ (allPlayers.length)) * innerHeight;

    return (
        <div className={`flex flex-nowrap justify-start max-w-full overflow-auto`} style={{maxHeight:maxHeight+"px"}}>
          <svg width={width} height={maxHeight}>
            <g transform={`translate(${margin.left},${margin.top})`}>
            {conversations?.map((conv, index) => {
                const x = scaleX(conv.created);
                const indexPlayer1 = allPlayers.findIndex((p)=>p.pId==conv.participants[0]);
                const indexPlayer2 = allPlayers.findIndex((p)=>p.pId==conv.participants[1]);

                const y1 = scaleY(Math.min(indexPlayer1, indexPlayer2));
                const y2 = scaleY(Math.max(indexPlayer1, indexPlayer2));

                return (
                  <line
                    key={conv.id}
                    x1={x}
                    y1={y1}
                    x2={x}
                    y2={y2}
                    stroke={kwConversations.includes(conv.id) ? '#dc2626' : '#0e7490'}
                    strokeWidth={5}
                  />
                );
              }
              )}
              {allPlayers.map((player, index) => {
                const points = player.conversations.map(c => `${scaleX(c.created)}`).join(' ');

                return (
                  <g key={player.name}>
                     <line
                        x1={0}
                        y1={scaleY(index)}
                        x2={innerWidth}
                        y2={scaleY(index)}
                        stroke="#0e7490"
                        strokeWidth={5}
                      />
                      {player.knowsAfter && player.knowsAfter.length>0 && (
                        <line
                          x1={scaleX(player.knowsAfter[0])}
                          y1={scaleY(index)}
                          x2={innerWidth}
                          y2={scaleY(index)}
                          stroke="#dc2626"
                          strokeWidth={5}
                        />
                      )}
                    {player.conversations.map(conv => (
                      <circle
                        key={conv.id}
                        cx={scaleX(conv.created)}
                        cy={scaleY(index)}
                        r={8}
                        fill="#f1f5f9"
                        stroke={kwConversations.includes(conv.id) ? '#dc2626' : '#0e7490'}
                        strokeWidth="4"
                      />
                    ))}
                    <text x={-15} y={scaleY(index)} dy="0.35em" textAnchor="end">
                      {player.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

        </div>
    )
  }