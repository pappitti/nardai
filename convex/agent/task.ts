import { ObjectType, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { mutation, query } from '../_generated/server';
import { agentId, planId, teamId, taskId, parseGameId, GameId } from '../aiTown/ids';
import { SerializedTeam } from '../aiTown/team';
import { defineTable } from 'convex/server';
import { LLM_CONFIG } from '../util/llm';

// WIP

// stepID
// planID
// worldID (only needed when archived)
// description : string
// parentstepID optional (if null, then it is a root step)
// status : "TODO" | "completed" | "inProgress"
// keyTakeaways : string optional
// startTime : number optional
// requiredTeams : Team[] optional
// requiredPlayers : Player[] optional

export const serializedTask = {
    id: taskId,
    planId: planId,
    description: v.string(),
    parentTaskId: v.optional(taskId),
    status: v.union(v.literal('TODO'), v.literal('completed'), v.literal('inProgress')),
    keyTakeaways: v.optional(v.string()),
    startTime: v.optional(v.number()),
    finishBefore: v.optional(v.number()),
    requiredTeams: v.optional(v.array(teamId)),
    requiredAgents: v.optional(v.array(agentId)),
};

export type SerializedTask = ObjectType<typeof serializedTask>;

export class Task {
    id: GameId<'tasks'>;
    planId: GameId<'plans'>;
    description: string;
    parentTaskId?: GameId<'tasks'>;
    status: "TODO" | "completed" | "inProgress";
    keyTakeaways?: string;
    startTime?: number;
    finishBefore?: number;
    requiredTeams?: GameId<'teams'>[];
    requiredAgents?: GameId<'agents'>[];

    constructor(serialized: SerializedTask) {
        const { id, planId, description, parentTaskId, status, keyTakeaways, startTime, finishBefore} = serialized;
        this.id = parseGameId('tasks', id);
        this.planId = parseGameId('plans', planId);
        this.description = description;
        this.parentTaskId = parentTaskId? parseGameId('tasks',parentTaskId): undefined;
        this.status = status;
        this.keyTakeaways = keyTakeaways;
        this.startTime = startTime;
        this.finishBefore = finishBefore;
        this.requiredTeams = serialized.requiredTeams ? serialized.requiredTeams.map((id:string) => parseGameId('teams', id)) : undefined;
        this.requiredAgents = serialized.requiredAgents ? serialized.requiredAgents.map((id:string) => parseGameId('agents', id)) : undefined;
    };

    serialize(): SerializedTask {
        return {
            id: this.id,
            planId: this.planId,
            description: this.description,
            parentTaskId: this.parentTaskId,
            status: this.status,
            keyTakeaways: this.keyTakeaways,
            startTime: this.startTime,
            finishBefore: this.finishBefore,
            requiredTeams: this.requiredTeams,
            requiredAgents: this.requiredAgents,
        };
    };
}

// method : find parents upto the root and use text to pass to llm, query llm, update status

// export const listMessages = query({
//     args: {
//       worldId: v.id('worlds'),
//       conversationId,
//     },
//     handler: async (ctx, args) => {
//       const messages = await ctx.db
//         .query('messages')
//         .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId))
//         .collect();
//       const out = [];
//       for (const message of messages) {
//         const playerDescription = await ctx.db
//           .query('playerDescriptions')
//           .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
//           .first();
//         if (!playerDescription) {
//           throw new Error(`Invalid author ID: ${message.author}`);
//         }
//         out.push({ ...message, authorName: playerDescription.name });
//       }
//       return out;
//     },
//   });
  
//   export const writeMessage = mutation({
//     args: {
//       worldId: v.id('worlds'),
//       conversationId,
//       messageUuid: v.string(),
//       playerId,
//       text: v.string(),
//     },
//     handler: async (ctx, args) => {
//       await ctx.db.insert('messages', {
//         conversationId: args.conversationId,
//         author: args.playerId,
//         messageUuid: args.messageUuid,
//         text: args.text,
//         worldId: args.worldId,
//       });
//       await insertInput(ctx, args.worldId, 'finishSendingMessage', {
//         conversationId: args.conversationId,
//         playerId: args.playerId,
//         timestamp: Date.now(),
//       });
//     },
//   });


// export const planStep = {
  
//     playerId,
//   description: v.string(),
//   embeddingId: v.id('memoryEmbeddings'),
//   importance: v.number(),
//   lastAccess: v.number(),
//   data: v.union(
//     // Setting up dynamics between players
//     v.object({
//       type: v.literal('relationship'),
//       // The player this memory is about, from the perspective of the player
//       // whose memory this is.
//       playerId,
//     }),
//     v.object({
//       type: v.literal('conversation'),
//       conversationId,
//       // The other player(s) in the conversation.
//       playerIds: v.array(playerId),
//     }),
//     v.object({
//       type: v.literal('reflection'),
//       relatedMemoryIds: v.array(v.id('memories')),
//     }),
//   ),
// };
// export const memoryTables = {
//   memories: defineTable(memoryFields)
//     .index('embeddingId', ['embeddingId'])
//     .index('playerId_type', ['playerId', 'data.type'])
//     .index('playerId', ['playerId']),
//   memoryEmbeddings: defineTable({
//     playerId,
//     embedding: v.array(v.float64()),
//   }).vectorIndex('embedding', {
//     vectorField: 'embedding',
//     filterFields: ['playerId'],
//     dimensions: LLM_CONFIG.embeddingDimension,
//   }),
// };

// export const agentTables = {
//   ...memoryTables,
//   embeddingsCache: defineTable({
//     textHash: v.bytes(),
//     embedding: v.array(v.float64()),
//   }).index('text', ['textHash']),
// };
