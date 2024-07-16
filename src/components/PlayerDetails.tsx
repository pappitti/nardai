import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import closeImg from '../../assets/close.svg';
import interactImg from '../../assets/interact.svg';
import { SelectElement } from './Player';
import { Messages } from './Messages';
import { toastOnError } from '../toasts';
import { useSendInput } from '../hooks/sendInput';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';
import Button from './buttons/Button.tsx';

export default function PlayerDetails({
  worldId,
  engineId,
  game,
  playerId,
  setSelectedElement,
  setShowConversations,
  scrollViewRef,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  playerId?: GameId<'players'>;
  setSelectedElement: SelectElement;
  setShowConversations: (show:boolean)=>void; //added
  scrollViewRef: React.RefObject<HTMLDivElement>;
}) {
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    setShowPlan(false);
  }, [playerId]);

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId });

  const players = [...game.world.players.values()];
  const humanPlayer = players.find((p) => p.human === humanTokenIdentifier);
  const humanConversation = humanPlayer ? game.world.playerConversation(humanPlayer) : undefined;
  // Always select the other player if we're in a conversation with them.
  if (humanPlayer && humanConversation) {
    const otherPlayerIds = [...humanConversation.participants.keys()].filter(
      (p) => p !== humanPlayer.id,
    );
    playerId = otherPlayerIds[0];
  }

  const player = playerId && game.world.players.get(playerId);
  const playerConversation = player && game.world.playerConversation(player);

  const previousConversation = useQuery(
    api.world.previousConversation,
    playerId ? { worldId, playerId } : 'skip',
  );

  const playerDescription = playerId && game.playerDescriptions.get(playerId);

  const agents = [...game.world.agents.values()]
  const playerAgent = agents.find((a) => a.playerId === player?.id);
  const agentPlan = playerAgent?.plan?.serialize();

  agentPlan && console.log(playerDescription?.name, agentPlan);

  const startConversation = useSendInput(engineId, 'startConversation');
  const acceptInvite = useSendInput(engineId, 'acceptInvite');
  const rejectInvite = useSendInput(engineId, 'rejectInvite');
  const leaveConversation = useSendInput(engineId, 'leaveConversation');

  if (!playerId) {
    return (
      <div className="h-full text-xl text-white flex flex-col text-center items-center justify-between p-4">
        <div className="w-full m-4 p-4">Click on an agent on the map to see chat history.</div>
        <Button className="text-base " imgUrl={interactImg} onClick={() => setShowConversations(true)}>
            Map overview
        </Button> 
      </div>
    );
  }
  if (!player) {
    return null;
  }
  const isMe = humanPlayer && player.id === humanPlayer.id;
  const canInvite = !isMe && !playerConversation && humanPlayer && !humanConversation;
  const sameConversation =
    !isMe &&
    humanPlayer &&
    humanConversation &&
    playerConversation &&
    humanConversation.id === playerConversation.id;

  const humanStatus =
    humanPlayer && humanConversation && humanConversation.participants.get(humanPlayer.id)?.status;
  const playerStatus = playerConversation && playerConversation.participants.get(playerId)?.status;

  const haveInvite = sameConversation && humanStatus?.kind === 'invited';
  const waitingForAccept =
    sameConversation && playerConversation.participants.get(playerId)?.status.kind === 'invited';
  const waitingForNearby =
    sameConversation && playerStatus?.kind === 'walkingOver' && humanStatus?.kind === 'walkingOver';

  const inConversationWithMe =
    sameConversation &&
    playerStatus?.kind === 'participating' &&
    humanStatus?.kind === 'participating';

  const onStartConversation = async () => {
    if (!humanPlayer || !playerId) {
      return;
    }
    console.log(`Starting conversation`);
    await toastOnError(startConversation({ playerId: humanPlayer.id, invitee: playerId }));
  };
  const onAcceptInvite = async () => {
    if (!humanPlayer || !humanConversation || !playerId) {
      return;
    }
    await toastOnError(
      acceptInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onRejectInvite = async () => {
    if (!humanPlayer || !humanConversation) {
      return;
    }
    await toastOnError(
      rejectInvite({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  const onLeaveConversation = async () => {
    if (!humanPlayer || !inConversationWithMe || !humanConversation) {
      return;
    }
    await toastOnError(
      leaveConversation({
        playerId: humanPlayer.id,
        conversationId: humanConversation.id,
      }),
    );
  };
  // const pendingSuffix = (inputName: string) =>
  //   [...inflightInputs.values()].find((i) => i.name === inputName) ? ' opacity-50' : '';

  const pendingSuffix = (s: string) => '';
  return (
    <>
      <div className="flex gap-4 border-b-[6px] border-gray-300">
        <div className="w-3/4 sm:w-full mr-auto">
          <h2 className="p-2 font-display text-cyan-700 text-2xl sm:text-4xl tracking-wider shadow-solid">
            {playerDescription?.name}
          </h2>
        </div>
        <a
          className="cursor-pointer pointer-events-auto"
          onClick={() => setSelectedElement(undefined)}
        >
          <h2 className="h-full flex items-center">
            <img className="w-4 h-4 sm:w-5 sm:h-5" src={closeImg} />
          </h2>
        </a>
      </div>
      {canInvite && (
        <a
          className={
            'mt-6 option-button text-white shadow-solid text-base cursor-pointer pointer-events-auto' +
            pendingSuffix('startConversation')
          }
          onClick={onStartConversation}
        >
          <div className="h-full text-center">
            <span>Start conversation</span>
          </div>
        </a>
      )}
      {waitingForAccept && (
        <a className="mt-6 text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-90">
          <div className="h-full text-center">
            <span>Waiting for accept...</span>
          </div>
        </a>
      )}
      {waitingForNearby && (
        <a className="mt-6 text-white shadow-solid text-xl cursor-pointer pointer-events-auto opacity-90">
          <div className="h-full text-center">
            <span>Walking over...</span>
          </div>
        </a>
      )}
      {inConversationWithMe && (
        <a
          className={
            'mt-6 option-button cyan-button text-white shadow-solid text-base cursor-pointer pointer-events-auto' +
            pendingSuffix('leaveConversation')
          }
          onClick={onLeaveConversation}
        >
          <div className="h-full text-center">
            <span>Leave conversation</span>
          </div>
        </a>
      )}
      {haveInvite && (
        <>
          <a
            className={
              'mt-6 option-button text-white shadow-solid text-base cursor-pointer pointer-events-auto' +
              pendingSuffix('acceptInvite')
            }
            onClick={onAcceptInvite}
          >
            <div className="h-full text-center">
              <span>Accept</span>
            </div>
          </a>
          <a
            className={
              'mt-6 option-button text-white shadow-solid text-base cursor-pointer pointer-events-auto' +
              pendingSuffix('rejectInvite')
            }
            onClick={onRejectInvite}
          >
            <div className="h-full text-center">
              <span>Reject</span>
            </div>
          </a>
        </>
      )}
      {!playerConversation && player.activity && player.activity.until > Date.now() && (
        <div className="box w-full">
          <h2 className="text-base text-slate-400 sm:text-lg text-center">
            {player.activity.description}
          </h2>
        </div>
      )}
      <div className="desc my-6">
        <p className="leading-tight text-base text-slate-400 sm:text-sm">
          {!isMe && playerDescription?.description}
          {isMe && <i>This is you!</i>}
          {!isMe && inConversationWithMe && (
            <>
              <br />
              <br />(<i>Conversing with you!</i>)
            </>
          )}
        </p>
      </div>
      {!isMe && playerConversation && playerStatus?.kind === 'participating' && (
        <Messages
          worldId={worldId}
          engineId={engineId}
          inConversationWithMe={inConversationWithMe ?? false}
          conversation={{ kind: 'active', doc: playerConversation }}
          humanPlayer={humanPlayer}
          scrollViewRef={scrollViewRef}
        />
      )}
      {!playerConversation && previousConversation && (
        <>
          <div className="box w-full">
            <h2 className="text-slate-400 text-lg text-center">Previous conversation</h2>
          </div>
          <Messages
            worldId={worldId}
            engineId={engineId}
            inConversationWithMe={false}
            conversation={{ kind: 'archived', doc: previousConversation }}
            humanPlayer={humanPlayer}
            scrollViewRef={scrollViewRef}
          />
        </>
      )}
      {/*WIP : ability to show plans*/}
      {!playerConversation && !previousConversation && agentPlan && (
        <div className="relative flex flex-col w-full">
        <a
          className={
            'sticky mt-6 option-button cyan-button text-white shadow-solid text-base cursor-pointer pointer-events-auto'
          }
          onClick={() => setShowPlan(prevState => !prevState)}
        >
          <div className="h-full text-center">
            <span>Show plan</span>
          </div>
        </a>
        {showPlan && agentPlan && (
          <div className="desc my-6">
            <div className="text-base text-slate-400 sm:text-sm">
              {agentPlan.tasks?.map((task) => 
                <div key={task.taskId} 
                  style={{ 
                    marginTop: (task.taskId.split('.').length === 1 && task.taskId!='0') ? '1rem' : '0.5rem', 
                    paddingLeft: `${(task.taskId.split('.').length-1) * 10}px` }}
                >
                  <div className="text-slate-600 font-bold">
                    {task.taskId}:{task.description}
                  </div>
                  <div>status : {task.status}</div>
                  <div>required : {[...(task.requiredAgents||[]),...(task.requiredTeams||[])].join(', ')}</div>
                </div>
                )
              }
            </div>
          </div>
        )}
        </div>)
      }
    </>
  );
}
