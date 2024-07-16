import { ObjectType, v } from 'convex/values';
import { parseMap } from '../util/object';
import { internal } from '../_generated/api';
import { asyncMap } from '../util/asyncMap';
import { Doc, Id } from '../_generated/dataModel';
import { GameId, parseGameId, agentId} from './ids';
import { xmlTasks } from '../agent/planning';
import * as embeddingsCache from '../agent/embeddingsCache';
import * as memory from '../agent/memory';
import { Task, serializedTask, SerializedTask, generateTasks } from './task';
import { ActionCtx, internalMutation, internalQuery } from '../_generated/server';

const selfInternal = internal.aiTown.plan; 

export const serializedPlan = {
    id: v.id('plans'),
    created: v.number(),
    tasks: v.optional(
        v.array(
            v.object(serializedTask)
        )
    ),
  };

export type SerializedPlan = ObjectType<typeof serializedPlan>;
  
export class Plan {
    id: Id<'plans'>;
    created: number;
    tasks?: Map<Id<'tasks'>, Task>;

    constructor(serialized: SerializedPlan) {
        const { id,  created, tasks } = serialized;
        this.id = id;
        this.created = created;
        if (tasks) {
            this.tasks = parseMap(tasks, Task, (t) => t.id);
        }
    };

    serialize(): SerializedPlan {
    
        return {
            id: this.id,
            created: this.created,
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

    const {teams, playerDescription, agentDescription} = await ctx.runQuery(selfInternal.loadData, {
        worldId,
        agentId
      });

    const planTasks= planId && await ctx.runQuery(selfInternal.getPlan, {worldId, planId});

    let xmlPlan : string | undefined;
    if (planTasks){
        xmlPlan = xmlTasks(planTasks);
    }

    // TODO : everything below in a if statement ? if (planTasks) { ... }

    // To give a better context to each task, we reconstruct a string with its parents up to the root
    const taskParentStrings= planTasks && planTasks
        .filter((t)=> 
            t.id.split('.').length===3 // ids are of the form "1.2.3" with one index for each level
            && t.status!=="completed") // only tasks and that are not completed
        .map((task) => findTaskParents(task.id, planTasks));

    // get memories, based on parentStrings
    const taskEmbeddings = taskParentStrings && await embeddingsCache.fetchBatch(
        ctx,
        taskParentStrings,
      );

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

    const memoriesByTask = taskParentStrings && memories && taskParentStrings.map((task, i) => `Relevant memories related to task in plan : ${task}\n ${memories[i].map((m) => m.description).join('\n')}`);

    const newPlanId = await ctx.runMutation(
        selfInternal.createPlan,
        {worldId, agentId, now}
    );

    const args={
        teams, 
        playerDescription, 
        agentDescription, 
        xmlPlan, 
        conversationHistory,
        otherAgent,
        memoriesByTask
    }

    const tasks : SerializedTask[] = await generateTasks(args);

    await ctx.runMutation(internal.aiTown.task.insertTasks, {worldId, planId: newPlanId, tasks});

    const newSerializedPlan = {
        id: newPlanId,
        created: now,
        tasks
    };

    return newSerializedPlan
}

export function findTaskParents(id: Id<'tasks'>, planTasks : SerializedTask []){
    const allTasks = parseMap(planTasks, Task, (t) => t.id);
    let parentString = '';
    const targetTask = allTasks.get(id);
    if (!targetTask) {
        return parentString;
    }
    parentString += targetTask.description;
    let parentId = targetTask.parentTaskId;
    while (parentId) {
        const parentTask = allTasks.get(parentId);
        if (!parentTask) {
            break;
        }
        parentString += " > subtask : " + parentTask.description;
        parentId = parentTask.parentTaskId;
    }
    return parentString;
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
        const playerDescription = await ctx.db
            .query('playerDescriptions')
            .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', playerId))
            .first();
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

      return {teams, playerDescription, agentDescription};
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

export const createPlan = internalMutation({
    args: {
      worldId: v.id('worlds'),
      agentId,
      now: v.number(),
    },
    handler: async (ctx, { worldId, agentId, now}) => {
      const planId = await ctx.db.insert('plans', {
        worldId,
        agentId,
        created: now,
      });
      return planId;
    },
  });
  
