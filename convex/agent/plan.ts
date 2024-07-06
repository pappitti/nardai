import { ObjectType, v } from 'convex/values';
import { parseMap } from '../util/object';
import { internal } from '../_generated/api';
import { Game } from '../aiTown/game';
import { Agent } from '../aiTown/agent';
import { Doc, Id } from '../_generated/dataModel';
import { GameId, parseGameId, agentId} from '../aiTown/ids';
import { Task, serializedTask, SerializedTask, generateTasks } from './task';
import { SerializedAgentDescription } from '../aiTown/agentDescription';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';

// WIP
 
// id : planId
// startTime : number
// planSteps : PlanStep[]

// methods : reflect on plan steps and update plan
// when remembering a conversation, identify if the conversation can help with a step and update the step accordingle

// plan does not need worldId or agentIdas it is part of an agent but as soon as it is archived it requres a worldId and agentId

const selfInternal = internal.agent.plan; // just convex dev

export const serializedPlan = {
    id: v.id('plans'),
    created: v.number(),
    tasks: v.optional(v.array(v.object(serializedTask))),
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
        this.tasks = tasks && parseMap(tasks, Task, (t) => t.id);
    };

    serialize(): SerializedPlan {
        const result: any = {
            id: this.id,
            created: this.created
        };
    
        if (this.tasks && this.tasks.size > 0) {
            result.tasks = [...this.tasks.values()].map(task => task.serialize());
        }
    
        return result;
    };

};

// may not be needed if we remove the Task class
export interface dbTask extends Omit<SerializedTask,"id"> {
    _id: string;
}

export function xmlTasks(tasks: dbTask[]): string {
    if (!tasks || tasks.length===0) return '';

    // Helper function to escape special XML characters
    function escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }  });
    }

    const taskMap = new Map<string, dbTask >();
    const rootTasks: dbTask[] = [];

    for (const task of tasks) {
        taskMap.set(task._id, task);
        if (!task.parentTaskId) {
          rootTasks.push(task);
        }
      }

    // Helper function to recursively build XML for a task and its children
    const buildTaskXml = (task: dbTask, depth: number, indent: string = ''): string => {
        let xml = `${indent}<task id="${task._id}" depth="${depth}">\n`;
        xml += `${indent}  <description>${escapeXml(task.description)}</description>\n`;
        xml += `${indent}  <status>${task.status}</status>\n`;
        if (task.keyTakeaways) {
            xml += `${indent}  <keyTakeaways>${escapeXml(task.keyTakeaways)}</keyTakeaways>\n`;
        }
        if (task.startTime) {
            xml += `${indent}  <startTime>${task.startTime}</startTime>\n`;
        }
        if (task.finishBefore) {
            xml += `${indent}  <finishBefore>${task.finishBefore}</finishBefore>\n`;
        }
        if (task.requiredTeams) {
            xml += `${indent}  <requiredTeams>\n`;
            for (const team of task.requiredTeams) {
            xml += `${indent}    <team>${team}</team>\n`;
            }
            xml += `${indent}  </requiredTeams>\n`;
        }
        if (task.requiredAgents) {
            xml += `${indent}  <requiredAgents>\n`;
            for (const agent of task.requiredAgents) {
            xml += `${indent}    <agent>${agent}</agent>\n`;
            }
            xml += `${indent}  </requiredAgents>\n`;
        }
        
        // Find and process child tasks
        const childTasks = tasks.filter(t => t.parentTaskId === task._id);
        if (childTasks.length === 0) {
            xml += `${indent}  <subTasks>\n`;
            for (const childTask of childTasks) {
                xml += buildTaskXml(childTask, depth + 1, indent + '  ');
            }
            xml += `${indent}  </subTasks>\n`;
        }
        
        xml += `${indent}</task>\n`;
        return xml;
    }

     // Build the final XML
    let xmlTree = '<tasks>\n';
    for (const rootTask of rootTasks) {
        xmlTree += buildTaskXml(rootTask, 0, '  ');
    }
    xmlTree += '</tasks>';

    return xmlTree;
}

export async function reflectOnPlan(
    ctx: ActionCtx,
    worldId: Id<'worlds'>,
    agentId: GameId<'agents'>,
    now: number,
    planId?: Id<'plans'>,
  ) {

    const {teams, playerName, agentDescription} = await ctx.runQuery(selfInternal.loadData, {
        worldId,
        agentId
      });

    let xmlPlan;
    if (planId){
        const previousTasks = await ctx.runQuery( selfInternal.getPlan, {worldId,planId});
        xmlPlan = xmlTasks(previousTasks);
    }

    const newPlanId = await ctx.runMutation(
        selfInternal.createPlan,
        {worldId, agentId, now}
    );

    const tasks = await generateTasks(ctx, worldId, newPlanId, teams, playerName, agentDescription, xmlPlan);

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
        const playerName = playerDescription.name;
        const agentDescription = await ctx.db
            .query('agentDescriptions')
            .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('agentId', args.agentId))
            .first();
        if (!agentDescription) {
            throw new Error(`Agent description for ${args.agentId} not found`);
        }

      return {teams, playerName, agentDescription};
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
  
