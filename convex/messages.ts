import { v } from 'convex/values';
import { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { insertInput } from './aiTown/insertInput';
import { conversationId, playerId } from './aiTown/ids';

export type Message = Doc<'messages'>

export const listMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId))
      .collect();
    const out = [];
    for (const message of messages) {
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
        .first();
      if (!playerDescription) {
        throw new Error(`Invalid author ID: ${message.author}`);
      }
      out.push({ ...message, authorName: playerDescription.name });
    }
    return out;
  },
});

export const writeMessage = mutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    messageUuid: v.string(),
    playerId,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  },
});

export const findKeyword = query({
  args:{
    worldId: v.id('worlds'),
    text:v.string()
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withSearchIndex('keywordSearch', (q) => q.search("text",args.text))
      .collect();
      // const out = [];
      // for (const message of messages) {
      //   const playerDescription = await ctx.db
      //     .query('playerDescriptions')
      //     .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
      //     .first();
      //   if (!playerDescription) {
      //     throw new Error(`Invalid author ID: ${message.author}`);
      //   }
      //   out.push({ ...message, authorName: playerDescription.name });
      // }
      return messages;
    },
  });