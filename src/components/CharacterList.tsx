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
    // const players = [...game.world.players.values()];
    const players = [...game.playerDescriptions.values()]

    const isDefined = <T,>(value: T | undefined): value is T => value !== undefined;

    const playerCharacters = players
        // .map((p) => game.playerDescriptions.get(p.id)?.character)
        // .filter(isDefined)
        .map((p) => {
            const character = characters.find((c) => c.name === p.character);
            if (character) {
                return {...character,...p}
            }
        })
        .filter(isDefined); 

    return (
        <div className="flex grow px-4 mt-6 gap-5">
            {playerCharacters.map((c)=> 
                <div className="flex flex-col items-center" key={c.name}>
                    <div style={{
                            width: tileDim + 'px',
                            height: tileDim  + 'px',
                            backgroundImage: `url(${c.textureUrl})`,
                            backgroundPosition: `-${c.spritesheetData.frames.down2.frame.x}px -${c.spritesheetData.frames.down2.frame.y}px`,
                            transform: `scale(1.3)`,
                        }}></div>
                    <div className="my-4 text-cyan-700 shadow-solid" >{c.name}</div>
                </div>
            )}

        </div>
    )
  }