import { useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';
import closeImg from '../../assets/close.svg';
import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import CharacterList from './CharacterList.tsx';
import ConversationList from './ConversationList.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [showConversations, setShowConversations] = useState<boolean>(false);
  const [gameWrapperRef, { width, height }] = useElementSize();
  const [gameWindowRef, {width :gameWindowWidth, height : gameWindowheight}] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="relative w-full max-w m-4 grid grid-rows-[50vh_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto] grow max-w-[1400px] min-h-[50vh] game-frame" ref={gameWindowRef}>
        {/* map overview */}
        {showConversations && 
          <div className="absolute w-full h-full flex flex-col bg-gray-200/60 z-10 overflow-hidden">
            <div className="w-full min-h-[110px] flex flex-nowrap shrink-0">
              <CharacterList
                worldId={worldId}
                engineId={engineId}
                game={game}
              />
              <a
                className="cursor-pointer shrink-0 pointer-events-auto"
                onClick={() => setShowConversations(false)}
              >
                <h2 className="h-full flex p-5">
                  <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
                </h2>
              </a>
            </div>
            <div className="h-[6px] bg-red-600 mx-[40px] shrink-0"></div>
            <div className="w-full grow">
              <ConversationList
                worldId={worldId}
                engineId={engineId}
                game={game}
                height={gameWindowheight}
              />
            </div>
          </div>
          }
        {/* Game area */}
        <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
                {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={setSelectedElement}
                  />
                </ConvexProvider>
              </Stage>
            </div>
          </div>
        </div>
        {/* Right column area */}
        <div
          className={`flex flex-col overflow-y-auto shrink-0 px-4 py-4 lg:w-80 xl:pr-6 border-t-[6px] lg:border-t-0 lg:border-l-[6px] border-slate-900  ${!showConversations?"bg-gray-200/60":""} text-brown-100`}
          ref={scrollViewRef}
        >
          {!showConversations &&
          <PlayerDetails
            worldId={worldId}
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            setSelectedElement={setSelectedElement}
            setShowConversations={setShowConversations}
            scrollViewRef={scrollViewRef}
          />
          }
        </div>
        
      </div>
    </>
  );
}
