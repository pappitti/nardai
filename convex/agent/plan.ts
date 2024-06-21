import { ObjectType, v } from 'convex/values';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { LLMMessage, chatCompletion, fetchEmbedding } from '../util/llm';
import { asyncMap } from '../util/asyncMap';
import { GameId, agentId, conversationId, playerId } from '../aiTown/ids';
import { SerializedPlayer } from '../aiTown/player';
import { memoryFields } from './schema';

// player
// worldId : Id
// status : "current" | "archived"
// startTime : number
// planSteps : PlanStep[]

// methods : reflect on plan steps and update plan
// when remembering a conversation, identify if the conversation can help with a step and update the step accordingle


// export const serializedPlan = {
//     worldId: v.optional(v.id('worlds')),
//     playerId,
//     nextId: v.number(),
//     conversations: v.array(v.object(serializedConversation)),
//     players: v.array(v.object(serializedPlayer)),
//     agents: v.array(v.object(serializedAgent)),
//     historicalLocations: v.optional(historicalLocations),
//   };
//   export type SerializedPlan = ObjectType<typeof serializedPlan>;
  
//   export class Plan {
//     nextId: number;
//     conversations: Map<GameId<'conversations'>, Conversation>;
//     players: Map<GameId<'players'>, Player>;
//     agents: Map<GameId<'agents'>, Agent>;
//     historicalLocations?: Map<GameId<'players'>, ArrayBuffer>;
  
//     constructor(serialized: SerializedPlan) {
//       const { nextId, historicalLocations } = serialized;
  
//       this.nextId = nextId;
//       this.conversations = parseMap(serialized.conversations, Conversation, (c) => c.id);
//       this.players = parseMap(serialized.players, Player, (p) => p.id);
//       this.agents = parseMap(serialized.agents, Agent, (a) => a.id);
  
//       if (historicalLocations) {
//         this.historicalLocations = new Map();
//         for (const { playerId, location } of historicalLocations) {
//           this.historicalLocations.set(parseGameId('players', playerId), location);
//         }
//       }
//     }
  
//     playerConversation(player: Player): Conversation | undefined {
//       return [...this.conversations.values()].find((c) => c.participants.has(player.id));
//     }
  
//     serialize(): SerializedPlan {
//       return {
//         nextId: this.nextId,
//         conversations: [...this.conversations.values()].map((c) => c.serialize()),
//         players: [...this.players.values()].map((p) => p.serialize()),
//         agents: [...this.agents.values()].map((a) => a.serialize()),
//         historicalLocations:
//           this.historicalLocations &&
//           [...this.historicalLocations.entries()].map(([playerId, location]) => ({
//             playerId,
//             location,
//           })),
//       };
//     }
//   }