import { ObjectType, v } from 'convex/values';
import { parseMap } from '../util/object';
import { internal } from '../_generated/api';
import { asyncMap } from '../util/asyncMap';
import { Doc, Id } from '../_generated/dataModel';
import { GameId, parseGameId, agentId} from './ids';
import { jsonTasks } from '../agent/planning';
import * as embeddingsCache from '../agent/embeddingsCache';
import * as memory from '../agent/memory';
import { Task, serializedTask, SerializedTask, generateTasks } from './task';
import { ActionCtx, internalMutation, internalQuery, query } from '../_generated/server';

const selfInternal = internal.aiTown.plan; 

export const serializedPlan = {
    id: v.id('plans'),
    creationTime : v.optional(v.number()),
    tasks: v.optional(
        v.array(
            v.object(serializedTask)
        )
    ),
  };

export type SerializedPlan = ObjectType<typeof serializedPlan>;
  
export class Plan {
    id: Id<'plans'>;
    creationTime?: number;
    tasks?: Map<string, Task>;

    constructor(serialized: SerializedPlan) {
        const { id, creationTime, tasks } = serialized;
        this.id = id;
        this.creationTime = creationTime;
        if (tasks) {
            this.tasks = parseMap(tasks, Task, (t) => t.taskId);
        }
    };

    serialize(): SerializedPlan {
    
        return {
            id: this.id,
            creationTime: this.creationTime,
            tasks: this.tasks && [...this.tasks.values()].map((t) => t.serialize()),
        };
    };

};


export async function reflectOnPlan(
    ctx: ActionCtx,
    worldId: Id<'worlds'>,
    agentId: GameId<'agents'>,
    now: number,
    planId?: Id<'plans'>,
    conversationHistory?: string,
    otherAgent?: string,
  ) {

    const {teams, allPlayersNames, playerDescription, agentDescription} = await ctx.runQuery(selfInternal.loadData, {
        worldId,
        agentId
      });

    const planTasks= planId && await ctx.runQuery(selfInternal.getPlan, {worldId, planId});

    let xmlPlan : string | undefined;
    let memoriesByTask : string[] | undefined;
    if (planTasks){
        xmlPlan = jsonTasks(planTasks);

        // To give a better context to each task, we reconstruct a string with its parents up to the root
        const taskParentStrings= findParentStrings(planTasks);

        // get memories, based on parentStrings
        const taskEmbeddings = taskParentStrings && await embeddingsCache.fetchBatch(
            ctx,
            taskParentStrings,
        );

        console.log({
            agentId,
            "planId":planId, 
            "plan tasks":planTasks, 
            "task list":taskParentStrings, 
            "task embeddings":taskEmbeddings?.hits
        });

        const memories= taskEmbeddings && await asyncMap(
            taskEmbeddings.embeddings, 
            async (embedding) => {
                const taskMemories = await memory.searchMemories(ctx, playerDescription.playerId as GameId<'players'>, embedding, 3);
                return taskMemories;
            }
        );

        if (memories?.length !== taskParentStrings?.length) {
            throw new Error('Mismatch between memories and taskParentStrings');
        }

        memoriesByTask = taskParentStrings && memories && taskParentStrings.map((task, i) => `Relevant memories related to task in plan : ${task}\n ${memories[i].map((m) => m.description).join('\n')}`);

    }

    const newPlanId = await ctx.runMutation(
        selfInternal.createPlan,
        {worldId, agentId}
    );

    const args={
        teams,
        allPlayersNames, 
        playerDescription, 
        agentDescription, 
        xmlPlan, 
        conversationHistory,
        otherAgent,
        memoriesByTask
    }

    const tasks : SerializedTask[] | undefined = await generateTasks(args);

    if (tasks && tasks.length > 0) {
        for (const task of tasks) {
            task.planId = newPlanId;
        }
        await ctx.runMutation(internal.aiTown.task.insertTasks, {worldId, tasks});

        const newSerializedPlan = {
            id: newPlanId,
            tasks
        };

        // console.log(newSerializedPlan);

        return newSerializedPlan
    }

    return undefined;
}

export function findParentStrings(planTasks: SerializedTask[]):  string[] {
    const sortedTasks = planTasks.sort((a, b) => a.taskId.split('.').length - b.taskId.split('.').length);
    const parentChains = new Map<string, string[]>();
    const childlessTasks: string[] = [];
  
    for (const task of sortedTasks) {
      const parentIds = task.taskId.split('.').slice(0, -1);
      const parentId = parentIds.join('.');
      const currentChain = parentId ? [...(parentChains.get(parentId) || []), task.description] : [task.description];
  
      if (sortedTasks.some(t => t.taskId.startsWith(task.taskId + '.'))) {
        // This task has children, store its chain for future use
        parentChains.set(task.taskId, currentChain);
      } else {
        // This is a childless task, add it to the result
        childlessTasks.push(currentChain.join(' > subtask : '));
      }
    }
  
    return childlessTasks;
  }

export const loadData = internalQuery({
    args: {
        worldId: v.id('worlds'),
        agentId,
    },
    handler: async (ctx, args) => {
        const world = await ctx.db.get(args.worldId);
        if (!world) {
          throw new Error(`World ${args.worldId} not found`);
        }
        const teams = world.teams;

        const agent = world.agents.find((p) => p.id === args.agentId);
        if (!agent) {
            throw new Error(`Agent ${args.agentId} not found`);
        }
        const playerId = agent.playerId;
        const PlayerDescriptions = await ctx.db
            .query('playerDescriptions')
            .filter((q) => q.eq(q.field("worldId"), args.worldId))
            .collect();
        const allPlayersNames = PlayerDescriptions.map((p) => p.name);
        const playerDescription = PlayerDescriptions.find((p) => p.playerId === playerId);
        if (!playerDescription) {
            throw new Error(`Player description for ${playerId} not found`);
        }
        const agentDescription = await ctx.db
            .query('agentDescriptions')
            .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
            .first();
        if (!agentDescription) {
            throw new Error(`Agent description for ${args.agentId} not found`);
        }

      return {teams, allPlayersNames, playerDescription, agentDescription};
    }
})

export const getPlan = internalQuery({
    args: {
        worldId: v.id('worlds'),
        planId: v.id('plans'),
    },
    handler: async (ctx, args) => {
      const tasks = await ctx.db.query('tasks')
        .withIndex('plan', (q)=>q.eq('worldId', args.worldId).eq('planId', args.planId))
        .collect();
      return tasks;
    }  
});

// I wanted to use the same function for both internal queries and api queries, but I couldn't be sure about the best way to do it so I duplicated the function
export const getPlanTasks = query({
    args: {
        worldId: v.id('worlds'),
        planId: v.id('plans'),
    },
    handler: async (ctx, args) => {
      const tasks = await ctx.db.query('tasks')
        .withIndex('plan', (q)=>q.eq('worldId', args.worldId).eq('planId', args.planId))
        .collect();
      return tasks;
    }  
});

export const createPlan = internalMutation({
    args: {
      worldId: v.id('worlds'),
      agentId
    },
    handler: async (ctx, { worldId, agentId}) => {
      const planId = await ctx.db.insert('plans', {
        worldId,
        agentId
      });
      return planId;
    },
  });
  
  export const listAllPlans = query({
    args: {
      worldId: v.id('worlds'),
    },
    handler: async (ctx, args) => {
      const plans = await ctx.db
        .query('plans')
        .filter((q) => q.eq(q.field('worldId'),args.worldId))
        .collect();
        
      return plans;
    },
  });
  