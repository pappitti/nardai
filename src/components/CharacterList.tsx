import { Id } from '../../convex/_generated/dataModel';
import { ServerGame } from '../hooks/serverGame';
import { characters } from '../../data/characters.ts';

export default function CharacterList({
    worldId,
    engineId,
    game,

  }: {
    worldId: Id<'worlds'>;
    engineId: Id<'engines'>;
    game: ServerGame;
  }) {
    const tileDim = game.worldMap.tileDim;
    const scale = 1.3;
    const players = [...game.playerDescriptions.values()]

    const isDefined = <T,>(value: T | undefined): value is T => value !== undefined;

    const playerCharacters = players
        .map((p) => {
            const character = characters.find((c) => c.name === p.character);
            if (character) {
                return {...character,...p}
            }
        })
        .filter(isDefined); 

    return (
        <div className="flex grow px-4 mt-6 gap-5 overflow-x-auto" /* overflow-y-visible */>
            {playerCharacters.map((c)=> 
                <div className="flex flex-col items-center" key={c.name}>
                    <div style={{
                            margin: '5px 0' ,
                            width: tileDim + 'px',
                            height: tileDim  + 'px',
                            backgroundImage: `url(${c.textureUrl})`,
                            backgroundPosition: `-${c.spritesheetData.frames.down2.frame.x}px -${c.spritesheetData.frames.down2.frame.y}px`,
                            transform: `scale(${scale})`,
                        }}></div>
                    <div className="my-2 text-cyan-700 shadow-solid" >{c.name}</div>
                </div>
            )}

        </div>
    )
  }