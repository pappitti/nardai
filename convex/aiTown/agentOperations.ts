import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import {Game} from '../aiTown/game';
import { WorldMap, serializedWorldMap } from './worldMap';
import { rememberConversation, reflectOnMemories } from '../agent/memory';
import { GameId, agentId, conversationId, playerId } from './ids';
import {
  continueConversationMessage,
  leaveConversationMessage,
  startConversationMessage,
} from '../agent/conversation';
import { assertNever } from '../util/assertNever';
import { serializedAgent } from './agent';
import { serializedPlan, SerializedPlan, reflectOnPlan } from './plan';
import { ACTIVITIES, ACTIVITY_COOLDOWN, CONVERSATION_COOLDOWN, AGENT_MOTIVATION } from '../constants';
import { api, internal } from '../_generated/api';
import { sleep } from '../util/sleep';
import { serializedPlayer } from './player';
import { serializedAgentDescription } from './agentDescription';

export const agentRememberConversation = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    planId : v.optional(v.id('plans')),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const {description, newPlan} = await rememberConversation(
      ctx,
      args.worldId,
      args.agentId as GameId<'agents'>,
      args.playerId as GameId<'players'>,
      args.conversationId as GameId<'conversations'>,
      args.planId,
    ) || { description: '', newPlan: null };
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishRememberConversation',
      args: {
        agentId: args.agentId,
        operationId: args.operationId,
        plan: newPlan,
      },
    });
  },
});

export const agentUpdatePlan = internalAction({
  args: {
    worldId: v.id('worlds'),
    agentId,
    plan: v.object(serializedPlan),
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishPlanning',
      args: {
        operationId: args.operationId,
        agentId: args.agentId,
        plan: args.plan
      },
    });
  },
});

export const agentGenerateMessage = internalAction({
  args: {
    worldId: v.id('worlds'),
    playerId,
    agentId,
    conversationId,
    otherPlayerId: playerId,
    operationId: v.string(),
    type: v.union(v.literal('start'), v.literal('continue'), v.literal('leave')),
    messageUuid: v.string(),
  },
  handler: async (ctx, args) => {
    let completionFn;
    switch (args.type) {
      case 'start':
        completionFn = startConversationMessage;
        break;
      case 'continue':
        completionFn = continueConversationMessage;
        break;
      case 'leave':
        completionFn = leaveConversationMessage;
        break;
      default:
        assertNever(args.type);
    }
    const completion = await completionFn(
      ctx,
      args.worldId,
      args.conversationId as GameId<'conversations'>,
      args.playerId as GameId<'players'>,
      args.otherPlayerId as GameId<'players'>,
    );
    // TODO: stream in the text instead of reading it all at once.
    const text = await completion.readAll();

    await ctx.runMutation(internal.aiTown.agent.agentSendMessage, {
      worldId: args.worldId,
      conversationId: args.conversationId,
      agentId: args.agentId,
      playerId: args.playerId,
      text,
      messageUuid: args.messageUuid,
      leaveConversation: args.type === 'leave',
      operationId: args.operationId,
    });
  },
});

export const agentDoSomething = internalAction({
  args: {
    worldId: v.id('worlds'),
    player: v.object(serializedPlayer),
    agent: v.object(serializedAgent),
    map: v.object(serializedWorldMap),
    otherFreePlayers: v.array(v.object(serializedPlayer)),
    operationId: v.string(),
    agentDescription: v.optional(v.object(serializedAgentDescription)), 
    //name: v.union(v.string(), v.null()),
    //teamDescription: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { player, agent, agentDescription} = args;
    const map = new WorldMap(args.map);
    const now = Date.now();
    // Don't try to start a new conversation if we were just in one.
    const justLeftConversation =
      agent.lastConversation && now < agent.lastConversation + CONVERSATION_COOLDOWN;
    // Don't try again if we recently tried to find someone to invite.
    const recentlyAttemptedInvite =
      agent.lastInviteAttempt && now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN;
    const recentActivity = player.activity && now < player.activity.until + ACTIVITY_COOLDOWN;
    
    if (!player.pathfinding) {
      // decide first if agent wants to work on a plan
      if (Math.random() < AGENT_MOTIVATION) {
      // meaning motivation to reflect on memories and create or update a plan
        await reflectOnMemories(ctx, args.worldId, player.id as GameId<'players'>);
        
        const newPlan : SerializedPlan | undefined = await reflectOnPlan(
          ctx,
          args.worldId,
          agent.id as GameId<'agents'>,
          now,
          agent.plan?.id,
        );

        await sleep(Math.random() * 1000);

        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            plan : newPlan
          },
        });

        return
      }
      // Decide whether to do an activity or wander somewhere.
      else if (recentActivity || justLeftConversation) {
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
          worldId: args.worldId,
          name: 'finishDoSomething',
          args: {
            operationId: args.operationId,
            agentId: agent.id,
            destination: wanderDestination(map),
          },
        });
        return;
      } else {
        // TODO: have LLM choose the activity & emoji
        let relevantActivities
        if (agentDescription?.teamType !== null){
          relevantActivities = ACTIVITIES.filter((a)=>a.teams.includes(agentDescription?.teamType!));
        } else {
          relevantActivities = ACTIVITIES 
        }
        const activity = relevantActivities[Math.floor(Math.random() * relevantActivities.length)];
         //proviously in AI town : const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        await sleep(Math.random() * 1000);
        await ctx.runMutation(api.aiTown.main.sendInput, {
            worldId: args.worldId,
            name: 'finishDoSomething',
            args: {
              operationId: args.operationId,
              agentId: agent.id,
              activity: {
                description: activity.description,
                emoji: activity.emoji,
                until: Date.now() + activity.duration,
              },
            },
          });
        return;
      }
    }
    // if agent is wandering, try to engage in conversation 
    const invitee =
      justLeftConversation || recentlyAttemptedInvite
        ? undefined
        : await ctx.runQuery(internal.aiTown.agent.findConversationCandidate, {
            now,
            worldId: args.worldId,
            player: args.player,
            otherFreePlayers: args.otherFreePlayers,
          });

    // TODO: We hit a lot of OCC errors on sending inputs in this file. It's
    // easy for them to get scheduled at the same time and line up in time.
    await sleep(Math.random() * 1000);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: args.worldId,
      name: 'finishDoSomething',
      args: {
        operationId: args.operationId,
        agentId: args.agent.id,
        invitee,
      },
    });
  },
});

function wanderDestination(worldMap: WorldMap) {
  // Wander someonewhere at least one tile away from the edge.
  return {
    x: 1 + Math.floor(Math.random() * (worldMap.width - 2)),
    y: 1 + Math.floor(Math.random() * (worldMap.height - 2)),
  };
}
