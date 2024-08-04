import React, { useState, useEffect, useRef, createRef } from 'react';
import { useElementSize } from 'usehooks-ts';
import { Id, Doc } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { useQuery } from 'convex/react';
import { GameId } from '../../convex/aiTown/ids.ts';
import SearchComponent from './searchBar.tsx';
import { Conversation } from '../../convex/aiTown/conversation.ts';
import { Player } from '../../convex/aiTown/player.ts';
import { Agent } from '../../convex/aiTown/agent.ts'; 
import { ServerGame } from '../hooks/serverGame.ts';
import { Messages } from './Messages.tsx';
import {Plans} from './Plan.tsx';

function unionWithoutDuplicates(list1: string[], list2: string[]): string[] {
  const set = new Set([...list1, ...list2]);
  return Array.from(set);
}

export default function ConvosAndPlansTracker({
    worldId,
    engineId,
    game,
    // height,
    // width,
  }: {
    worldId: Id<'worlds'>;
    engineId: Id<'engines'>;
    game: ServerGame;
    // height: number;
    // width: number;
  }) {

    const [searchedString, setSearchedString] = useState<string|undefined>(undefined);
    const [showConversation, setShowConversation] = useState<Doc<'archivedConversations'>|undefined>();
    const [showPlan, setShowPlan] = useState<Id<'plans'>|undefined>();
    const [kwConversations, setKwConversations] = useState<string[]>([]);
    const [svgWidth, setSvgWidth] = useState(0);
    const [svgHeight, setSvgHeight] = useState(0);  

    const [convoMapRef, { width, height }] = useElementSize();

    useEffect(() => {
      if (width && height) {
        setSvgWidth(width);
        setSvgHeight(height); //  subtract 120?
      }
    }, [width, height]);

    useEffect(() => {
      if (showPlan) {
        setShowConversation(undefined);
      }
    }, [showPlan]);

    useEffect(() => {
      if (showConversation) {
        setShowPlan(undefined);
      }
    }, [showConversation]);

    const scrollViewRef = useRef<HTMLDivElement>(null);
  
    const conversations = useQuery(api.aiTown.conversation.listArchivedConversations, {worldId});

    const plans = useQuery(api.aiTown.plan.listAllPlans, {worldId});

    const messages = useQuery(api.messages.findKeyword , searchedString
      ? {worldId,text: searchedString} 
      : 'skip'
    );

    useEffect(() => {
      if (messages && searchedString) {
        const matchedConversations = messages.map((m) => m.conversationId) ?? [];
        setKwConversations(matchedConversations);
      } else {
        setKwConversations([]);
      }
    }, [messages, searchedString]);

    const archivedPlayers = useQuery(api.aiTown.player.listArchivedPlayers, {worldId})?.map((p)=>p.id)??[];

    const worldPlayers = [...game.world.players.values()].map((p:Player)=>p.id)

    const worldAgents = [...game.world.agents.values()]
      .reduce((acc:Record<string,string>,a:Agent)=>{
        acc[a.playerId]=a.id
        return acc
      },{});

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
            .sort(),
          plans: plans?.filter((p)=>p.agentId==worldAgents[pId])??[]
          }
        }
      );

    //console.log(worldAgents, plans, allPlayers);

    const margin = { top: 20, right: 50, bottom: 30, left: 100 };
    const innerWidth = svgWidth - margin.left - margin.right;
    const innerHeight = svgHeight - margin.top - margin.bottom;
  
    const minTime = Math.min(...conversations?.map(c => c.created)??[], ...plans?.map(p => p._creationTime)??[]);
    const maxTime = Math.max(...conversations?.map(c => c.created)??[], ...plans?.map(p => p._creationTime)??[]);
    const totalTime = maxTime - minTime;
  
    const scaleX = (time: number) => ((time-minTime) / totalTime) * innerWidth;
    const scaleY = (index: number) => ((index + 0.5)/ (allPlayers.length)) * innerHeight;

    return (
        <div className={`relative w-full grid grid-rows-[50vh_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto] grow justify-start max-w-full overflow-auto`} /*style={{maxHeight:maxHeight+"px"}}*/>
          <div className="flex w-full h-full min-h-0" ref={convoMapRef}>
            <svg width='100%' height='100%' viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
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
                {allPlayers.map((player, index) => //{
                  //const points = player.conversations.map(c => `${scaleX(c.created)}`).join(' ');

                  //return (
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
                          onClick={() => setShowConversation(conv)}
                          className="cursor-pointer"
                        />
                      ))}
                      {player.plans.map(plan => (
                        <rect
                          key={plan._id}
                          x={scaleX(plan._creationTime) - 8}
                          y={scaleY(index) - 8}
                          width={16} // Total width of the square
                          height={16} // Total height of the square
                          fill="#f1f5f9"
                          stroke={'#0e7490'}
                          strokeWidth="4"
                          onClick={() => setShowPlan(plan._id)}
                          className="cursor-pointer"
                        />
                      ))}
                      <text x={-15} y={scaleY(index)-10} dy="0.35em" textAnchor="end">
                        {player.name}
                      </text>
                      <text x={-15} y={scaleY(index)+10} dy="0.35em" textAnchor="end">
                        {worldAgents[player.pId]}
                      </text>
                    </g>
                  //);
                //}
                )
                }
              </g>
            </svg>
          </div>
          <div className="relative flex flex-col overflow-y-auto shrink-0 px-4 py-4 lg:w-80 xl:pr-6 min-h-0" ref={scrollViewRef}>
            <SearchComponent setSearchedString={setSearchedString}/>
            {showConversation && 
              <Messages
                worldId={worldId}
                engineId={engineId}
                inConversationWithMe={false}
                conversation={{ kind: 'archived', doc: showConversation}}
                scrollViewRef={scrollViewRef}
                asOverview={true}
              />
            }
            {showPlan && 
              <Plans
                worldId={worldId}
                planId={showPlan}
              />
            }
          </div>
        </div>
    )
  }