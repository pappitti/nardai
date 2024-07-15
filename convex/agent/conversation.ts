import { v } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { ActionCtx, internalQuery } from '../_generated/server';
import { LLMMessage, chatCompletion } from '../util/llm';
import { asyncMap } from '../util/asyncMap';
import * as memory from './memory';
import { SerializedPlan, findTaskParents} from '../aiTown/plan';
import { SerializedPlayer } from '../aiTown/player';
import { api, internal } from '../_generated/api';
import * as embeddingsCache from './embeddingsCache';
import { GameId, conversationId, playerId } from '../aiTown/ids';
import { NUM_MEMORIES_TO_SEARCH } from '../constants';
import { Game } from '../aiTown/game';

const selfInternal = internal.agent.conversation;

export async function startConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, agent, otherAgent, lastConversation } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const embedding = await embeddingsCache.fetch(
    ctx,
    `${player.name} is talking to ${otherPlayer.name}`,
  );

  const memories = await memory.searchMemories(
    ctx,
    player.id as GameId<'players'>,
    embedding,
    Number(process.env.NUM_MEMORIES_TO_SEARCH) || NUM_MEMORIES_TO_SEARCH,
  );

  const memoryWithOtherPlayer = memories.find(
    (m) => m.data.type === 'conversation' && m.data.playerIds.includes(otherPlayerId),
  );

  const prompt = [
    `You just started a conversation with ${otherPlayer.name}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  if (agent?.plan) {
    prompt.push(await planPrompt(ctx, otherPlayer, agent, otherAgent ?? null))
  }
  prompt.push(...previousConversationPrompt(otherPlayer, lastConversation));
  prompt.push(...relatedMemoriesPrompt(memories));
  if (memoryWithOtherPlayer) {
    prompt.push(
      `Be sure to include some detail or question about a previous conversation in your greeting.`,
    );
  };

  const { content } = await chatCompletion({
    messages: [
      systemPrompt(player, agent),
      {
        role: 'user',
        content: prompt.join('\n'),
      },
      { 
        role: 'assistant', 
        content: `${player.name}:` }
    ],
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function continueConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const now = Date.now();
  const started = new Date(conversation.created);
  const embedding = await embeddingsCache.fetch(
    ctx,
    `What do you think about ${otherPlayer.name}?`,
  );
  const memories = await memory.searchMemories(ctx, player.id as GameId<'players'>, embedding, 3);
  const prompt = [
    `You are currently in a conversation with ${otherPlayer.name}.`,
    `The conversation started at ${started.toLocaleString()}. It's now ${now.toLocaleString()}.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  if (agent?.plan) {
    prompt.push(await planPrompt(ctx, otherPlayer, agent, otherAgent ?? null))
  }
  prompt.push(...relatedMemoriesPrompt(memories));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `DO NOT greet them again. Do NOT use the word "Hey" too often. Your response should be brief and within 200 characters.`,
  );

  const llmMessages: LLMMessage[] = [
    systemPrompt(player, agent),
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'assistant', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export async function leaveConversationMessage(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  conversationId: GameId<'conversations'>,
  playerId: GameId<'players'>,
  otherPlayerId: GameId<'players'>,
) {
  const { player, otherPlayer, conversation, agent, otherAgent } = await ctx.runQuery(
    selfInternal.queryPromptData,
    {
      worldId,
      playerId,
      otherPlayerId,
      conversationId,
    },
  );
  const prompt = [
    `You are currently in a conversation with ${otherPlayer.name}.`,
    `You've decided to leave the question and would like to politely tell them you're leaving the conversation.`,
  ];
  prompt.push(...agentPrompts(otherPlayer, agent, otherAgent ?? null));
  prompt.push(
    `Below is the current chat history between you and ${otherPlayer.name}.`,
    `How would you like to tell them that you're leaving? Your response should be brief and within 200 characters.`,
  ); 
  const llmMessages: LLMMessage[] = [
    systemPrompt(player, agent),
    {
      role: 'user',
      content: prompt.join('\n'),
    },
    ...(await previousMessages(
      ctx,
      worldId,
      player,
      otherPlayer,
      conversation.id as GameId<'conversations'>,
    )),
  ];
  llmMessages.push({ role: 'assistant', content: `${player.name}:` });

  const { content } = await chatCompletion({
    messages: llmMessages,
    max_tokens: 300,
    stream: true,
    stop: stopWords(otherPlayer.name, player.name),
  });
  return content;
}

export function systemPrompt(
  player: { name: string },
  agent: { identity: string; agenda: string; teamType:string ; teamDescription: string } | null,
) : LLMMessage{
    if (!agent) {
      throw new Error('Agent not found');
    }
    return {
      role: 'system',
      content: `You work in an Asset Management firm called "Nard AI" where you are part of the ${agent.teamType}. Your name is ${player.name}.\n Here is a brief about what your team's duties and objectives: ${agent.teamDescription}\n Here is a brief about you and your personality: ${agent.identity}.\n As part of your day-to-day job, you have to interact with other members of the firm. You speak English with them and generally talk in a polished manner but you can adapt your language to the person you talk to (for example, you use a more familiar language with members of your team or with colleagues with a same level of seniority). As part of your duties within the ${agent.teamType}, you make plans and you take actions but you also have your own agenda : ${agent.agenda}\n`
    };
}

function agentPrompts( // adding teams here
  otherPlayer: {name: string},
  agent: { 
    identity: string; 
    plan?: SerializedPlan | null; 
    teamType:string; 
    teamDescription: string; 
  } | null,
  otherAgent: {
    id : string; 
    identity: string;
    teamType:string; 
    teamDescription: string ;
    teamId: string; 
  } | null,
): string[] {

  const prompt = [];

  if (otherAgent) {
    const otherAgentTeam = otherAgent.teamType;
    const otherAgentTeamDescription = otherAgent.teamDescription;
    
    prompt.push(`${otherPlayer.name} is part of the ${otherAgentTeam}.\n About ${otherPlayer.name}'s team: ${otherAgentTeamDescription}\n About ${otherPlayer.name}: ${otherAgent.identity}.`);

  };

  return prompt;
}

async function planPrompt(
  ctx: ActionCtx,
  otherPlayer: { name: string, id: string },
  agent: { 
    identity: string; 
    plan?: SerializedPlan | null; 
    teamType:string; 
    teamDescription: string; 
  } | null,
  otherAgent: {
    id : string; 
    identity: string;
    teamType:string; 
    teamDescription: string ;
    teamId: string; 
  } | null,
) {
  const prompt = [];

  if (otherAgent) {
    const otherAgentTeam = otherAgent.teamType;

    if (agent?.plan) {
      const tasksInvolvingOtherAgent = agent.plan.tasks?.filter((task) => task.requiredAgents?.includes(otherPlayer.name) && task.status!=='completed');
      const tasksInvolvingOtherAgentTeam = agent.plan.tasks?.filter((task) => task.requiredTeams?.includes(otherAgentTeam) && task.status!=='completed' && !task.requiredAgents?.includes(otherPlayer.name)); // last condition to avoid duplicates

      if (tasksInvolvingOtherAgent && tasksInvolvingOtherAgent.length > 0) {
        prompt.push(`As part of your plan, you intended to talk to ${otherPlayer.name} regarding the following :`);

        const taskParentStrings = tasksInvolvingOtherAgent.map((task) => findTaskParents(task.id, agent.plan!.tasks!));

        const taskEmbeddings = taskParentStrings && await embeddingsCache.fetchBatch(
          ctx,
          taskParentStrings,
        );
  
        const memories= taskEmbeddings && await asyncMap(
            taskEmbeddings.embeddings, 
            async (embedding) => {
                const taskMemories = await memory.searchMemories(ctx, otherPlayer.id as GameId<'players'>, embedding, 3);
                return taskMemories;
            }
        );
    
        if (memories?.length !== taskParentStrings?.length) {
            throw new Error('Mismatch between memories and taskParentStrings');
        }
    
        const memoriesByTask = taskParentStrings && memories && taskParentStrings.map((task, i) => `Relevant memories related to task in plan : ${task}\n ${memories[i].map((m) => m.description).join('\n')}`);

        prompt.push(memoriesByTask.join('\n'));

        prompt.push(`\n`);
      }
      
      if (tasksInvolvingOtherAgentTeam && tasksInvolvingOtherAgentTeam.length > 0) {
        prompt.push(`As part of your plan, you intended to talk to a memnber of the ${otherAgentTeam} regarding the following :`);
        
        const taskParentStrings = tasksInvolvingOtherAgentTeam.map((task) => findTaskParents(task.id, agent.plan!.tasks!));

        const taskEmbeddings = taskParentStrings && await embeddingsCache.fetchBatch(
          ctx,
          taskParentStrings,
        );
  
        const memories= taskEmbeddings && await asyncMap(
            taskEmbeddings.embeddings, 
            async (embedding) => {
                const taskMemories = await memory.searchMemories(ctx, otherPlayer.id as GameId<'players'>, embedding, 3);
                return taskMemories;
            }
        );
    
        if (memories?.length !== taskParentStrings?.length) {
            throw new Error('Mismatch between memories and taskParentStrings');
        }
    
        const memoriesByTask = taskParentStrings && memories && taskParentStrings.map((task, i) => `Relevant memories related to task in plan : ${task}\n ${memories[i].map((m) => m.description).join('\n')}`);

        prompt.push(memoriesByTask.join('\n'));

        prompt.push(`\n`);
      };
    };
  }

  return prompt.join('\n');
}

function previousConversationPrompt(
  otherPlayer: { name: string },
  conversation: { created: number } | null,
): string[] {
  const prompt = [];
  if (conversation) {
    const prev = new Date(conversation.created);
    const now = new Date();
    prompt.push(
      `Last time you chatted with ${
        otherPlayer.name
      } it was ${prev.toLocaleString()}. It's now ${now.toLocaleString()}.`,
    );
  }
  return prompt;
}

function relatedMemoriesPrompt(memories: memory.Memory[]): string[] {
  const prompt = [];
  if (memories.length > 0) {
    prompt.push(`Here are some related memories in decreasing relevance order:`);
    for (const memory of memories) {
      prompt.push(' - ' + memory.description);
    }
    prompt.push(`\n`);
  }
  return prompt;
}

async function previousMessages(
  ctx: ActionCtx,
  worldId: Id<'worlds'>,
  player: { id: string; name: string },
  otherPlayer: { id: string; name: string },
  conversationId: GameId<'conversations'>,
) {
  const llmMessages: LLMMessage[] = [];
  const prevMessages = await ctx.runQuery(api.messages.listMessages, { worldId, conversationId });
  for (const message of prevMessages) {
    const author = message.author === player.id ? player : otherPlayer;
    const recipient = message.author === player.id ? otherPlayer : player;
    llmMessages.push({
      role: 'user',
      content: `${author.name} to ${recipient.name}: ${message.text}`,
    });
  }
  return llmMessages;
}

export const queryPromptData = internalQuery({
  args: {
    worldId: v.id('worlds'),
    playerId,
    otherPlayerId: playerId,
    conversationId,
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`World ${args.worldId} not found`);
    }
    const player = world.players.find((p) => p.id === args.playerId);
    if (!player) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const playerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .first();
    if (!playerDescription) {
      throw new Error(`Player description for ${args.playerId} not found`);
    }
    const otherPlayer = world.players.find((p) => p.id === args.otherPlayerId);
    if (!otherPlayer) {
      throw new Error(`Player ${args.otherPlayerId} not found`);
    }
    const otherPlayerDescription = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.otherPlayerId))
      .first();
    if (!otherPlayerDescription) {
      throw new Error(`Player description for ${args.otherPlayerId} not found`);
    }
    const conversation = world.conversations.find((c) => c.id === args.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${args.conversationId} not found`);
    }
    const agent = world.agents.find((a) => a.playerId === args.playerId);
    if (!agent) {
      throw new Error(`Player ${args.playerId} not found`);
    }
    const agentDescription = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', agent.id))
      .first();
    if (!agentDescription) {
      throw new Error(`Agent description for ${agent.id} not found`);
    }
    const agentTeam = agentDescription.teamType;
    const agentTeamDescription = world.teams.find((t) => t.name === agentTeam);
    if (!agentTeamDescription) {
      throw new Error(`Team ${agentTeam} not found`);
    }
    const otherAgent = world.agents.find((a) => a.playerId === args.otherPlayerId);
    let otherAgentDescription;
    let otherAgentTeamDescription;
    if (otherAgent) {
      otherAgentDescription = await ctx.db
        .query('agentDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', otherAgent.id))
        .first();
      if (!otherAgentDescription) {
        throw new Error(`Agent description for ${otherAgent.id} not found`);
      }
      const otherAgentTeam = otherAgentDescription.teamType;
      otherAgentTeamDescription = world.teams.find((t) => t.name === otherAgentTeam);
      if (!otherAgentTeamDescription) {
        throw new Error(`Team ${otherAgentTeam} not found`);
      }
    }
    const lastTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('edge', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('player1', args.playerId)
          .eq('player2', args.otherPlayerId),
      )
      // Order by conversation end time descending.
      .order('desc')
      .first();

    let lastConversation = null;
    if (lastTogether) {
      lastConversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) =>
          q.eq('worldId', args.worldId).eq('id', lastTogether.conversationId),
        )
        .first();
      if (!lastConversation) {
        throw new Error(`Conversation ${lastTogether.conversationId} not found`);
      }
    }
    // renaming plan to agenda to avoid confusion with the agent plan
    return {
      player: { name: playerDescription.name, ...player },
      otherPlayer: { name: otherPlayerDescription.name, ...otherPlayer },
      conversation,
      agent: { 
        identity: agentDescription.identity, 
        agenda: agentDescription.plan,  
        teamType: agentDescription.teamType,
        teamDescription: agentTeamDescription.description,
        teamId: agentTeamDescription.id,
        ...agent },
      otherAgent: otherAgent && {
        identity: otherAgentDescription!.identity,
        agenda: otherAgentDescription!.plan,
        teamType: otherAgentDescription!.teamType,
        teamDescription: otherAgentTeamDescription!.description,
        teamId: otherAgentTeamDescription!.id,
        ...otherAgent,
      },
      lastConversation,
    };
  },
});

function stopWords(otherPlayer: string, player: string) {
  // These are the words we ask the LLM to stop on. OpenAI only supports 4.
  const variants = [`${otherPlayer} to ${player}`];
  const stops= [...variants.flatMap((stop) => [stop + ':', stop.toLowerCase() + ':'])] 
  //, otherPlayer + ':', otherPlayer.toLowerCase() + ':' (tested if adding these could improve other models but it breaks LLama3)
  return stops;
}
