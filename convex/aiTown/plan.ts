import { ObjectType, v } from 'convex/values';
import { parseMap } from '../util/object';
import { internal } from '../_generated/api';
import { Message } from '../messages';
import { Doc, Id } from '../_generated/dataModel';
import { GameId, parseGameId, agentId} from './ids';
import { xmlTasks } from '../agent/planning';
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
        
        // if (this.tasks && this.tasks.size > 0) {
        //     result.tasks = [...this.tasks.values()].map(task => task.serialize());
        // }
    
        return {
            id: this.id,
            created: this.created,
            tasks: this.tasks && [...this.tasks.values()].map((t) => t.serialize()),
        };
    };

    getParents(id: Id<'tasks'>): Task[] {
        const parents: Task[] = [];
        const targetTask = this.tasks?.get(id);
        if (!targetTask) {
            return parents;
        }
        parents.push(targetTask)
        let parentId = targetTask.parentTaskId;
        while (parentId) {
            const parentTask = this.tasks?.get(parentId);
            if (!parentTask) {
                break;
            }
            parents.push(parentTask);
            parentId = parentTask.parentTaskId;
        }
        return parents;
    }

};

// may not be needed if we remove the Task class altogether
// export interface dbTask extends Omit<SerializedTask,"id"> {
//     _id: string;
// }


export async function reflectOnPlan(
    ctx: ActionCtx,
    worldId: Id<'worlds'>,
    agentId: GameId<'agents'>,
    now: number,
    plan?: SerializedPlan,
    messages?: Message[],
    authors?: string[],
  ) {

    // get memories

    const {teams, playerDescription, agentDescription} = await ctx.runQuery(selfInternal.loadData, {
        worldId,
        agentId
      });

    let xmlPlan;
    if (plan && plan.tasks){
        xmlPlan = xmlTasks(plan.tasks);
    }

    const newPlanId = await ctx.runMutation(
        selfInternal.createPlan,
        {worldId, agentId, now}
    );

    const args={
        teams, 
        playerDescription, 
        agentDescription, 
        xmlPlan, 
        messages,
        authors
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
        const player = world.agents.find((p) => p.id === args.agentId);
        if (!player) {
            throw new Error(`Agent ${args.agentId} not found`);
        }
        const playerId = player.id;
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
  
