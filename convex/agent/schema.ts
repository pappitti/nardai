import { v } from 'convex/values';
import { playerId, conversationId, agentId, teamId } from '../aiTown/ids';
import { defineTable } from 'convex/server';
import { LLM_CONFIG } from '../util/llm';

export const memoryFields = {
  playerId,
  description: v.string(),
  embeddingId: v.id('memoryEmbeddings'),
  importance: v.number(),
  lastAccess: v.number(),
  data: v.union(
    // Setting up dynamics between players
    v.object({
      type: v.literal('relationship'),
      // The player this memory is about, from the perspective of the player
      // whose memory this is.
      playerId,
    }),
    v.object({
      type: v.literal('conversation'),
      conversationId,
      // The other player(s) in the conversation.
      playerIds: v.array(playerId),
    }),
    v.object({
      type: v.literal('reflection'),
      relatedMemoryIds: v.array(v.id('memories')),
    }),
  ),
};
export const memoryTables = {
  memories: defineTable(memoryFields)
    .index('embeddingId', ['embeddingId'])
    .index('playerId_type', ['playerId', 'data.type'])
    .index('playerId', ['playerId']),
  memoryEmbeddings: defineTable({
    playerId,
    embedding: v.array(v.float64()),
  }).vectorIndex('embedding', {
    vectorField: 'embedding',
    filterFields: ['playerId'],
    dimensions: LLM_CONFIG.embeddingDimension,
  }),
};

export const planTables = {
  plans: defineTable({
    worldId: v.id('worlds'),
    agentId: agentId,
    created: v.number(),
  }).index('agent', ['worldId', 'agentId']),
  tasks: defineTable({
    worldId: v.id('worlds'),
    planId: v.id('plans'),
    description: v.string(),
    parentTaskId: v.optional(v.id('tasks')),
    nthChild: v.number(),
    status: v.union(v.literal('TODO'), v.literal('completed'), v.literal('inProgress')),
    keyTakeaways: v.optional(v.string()),
    startTime: v.optional(v.number()),
    requiredTeams: v.optional(v.array(teamId)),
    requiredAgents: v.optional(v.array(agentId)),
  })
    .index('plan', ['worldId', 'planId'])
    .index('subTasks', ['worldId', 'planId', 'parentTaskId']),
}

export const agentTables = {
  ...memoryTables,
  ...planTables,
  embeddingsCache: defineTable({
    textHash: v.bytes(),
    embedding: v.array(v.float64()),
  }).index('text', ['textHash']),
};
