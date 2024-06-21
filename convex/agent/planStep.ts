import { v } from 'convex/values';
import { playerId, teamId } from '../aiTown/ids';
import { defineTable } from 'convex/server';
import { LLM_CONFIG } from '../util/llm';

// WIP

// planID
// stepID
// description : string
// parentstepID optional (if null, then it is a root step)
// status : "TODO" | "completed" | "inProgress"
// keyTakeaways : string optional
// startTime : number optional
// requiredTeams : Team[] optional
// requiredPlayers : Player[] optional



// method : find parents upto the root and use text to pass to llm, query llm, update status

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
