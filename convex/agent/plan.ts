import { ObjectType, v } from 'convex/values';
import { parseMap } from '../util/object';
import { GameId, parseGameId, planId, agentId, taskId } from '../aiTown/ids';
import { Task, serializedTask, SerializedTask } from './task';
import { SerializedAgentDescription } from '../aiTown/agentDescription';
import { systemPrompt } from './conversation';
import { LLMMessage, chatCompletion } from '../util/llm';

// WIP
 
// id : planId
// startTime : number
// planSteps : PlanStep[]

// methods : reflect on plan steps and update plan
// when remembering a conversation, identify if the conversation can help with a step and update the step accordingle

// plan does not need worldId or agentIdas it is part of an agent but as soon as it is archived it requres a worldId and agentId

export const serializedPlan = {
    id: v.optional(planId),
    created: v.number(),
    tasks: v.array(v.object(serializedTask)),
  };

export type SerializedPlan = ObjectType<typeof serializedPlan>;
  
export class Plan {
    id: GameId<'plans'> | undefined;
    created: number;
    tasks?: Map<GameId<'tasks'>, Task>;

    constructor(serialized: SerializedPlan) {
        const { id, created } = serialized;
        this.id =id? parseGameId('plans', id): undefined;
        this.created = created;
        this.tasks = parseMap(serialized.tasks, Task, (t) => t.id);
    };

    serialize(): SerializedPlan {
        return {
            id: this.id,
            created: this.created,
            tasks: this.tasks? [...this.tasks.values()].map((task) => task.serialize()) : [],
        };
    };

    static async create(name: string, agentDescription: SerializedAgentDescription | null, teamDescription: string | null) : Promise<SerializedPlan> { //async?{ 
        
        const created = Date.now();
        const generatedTasks = await generateSteps(name,agentDescription, teamDescription);
    
       // see COnversation.Start
        return {created, tasks: generatedTasks}
        
    };

    
    xmlTasks(): string {
        if (!this.tasks) return '';

        const tasks = [...this.tasks.values()];

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

        const taskMap = new Map<string, SerializedTask>();
        const rootTasks: SerializedTask[] = [];

        for (const task of tasks) {
            taskMap.set(task.id, task);
            if (!task.parentTaskId) {
              rootTasks.push(task);
            }
          }

        // Helper function to recursively build XML for a task and its children
        const buildTaskXml = (task: SerializedTask, depth: number, indent: string = ''): string => {
            let xml = `${indent}<task id="${task.id}" depth="${depth}">\n`;
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
            const childTasks = tasks.filter(t => t.parentTaskId === task.id);
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

}


export async function updatePlan(name: string, agentDescription: SerializedAgentDescription | null, teamDescription: string | null ,plan: SerializedPlan) : Promise<SerializedPlan>  {
    // TODO
    
    const id = parseGameId('plans', plan.id!);
    return plan;
} //async?

async function generateSteps(name: string, agentDescription : SerializedAgentDescription | null, , teamDescription: string | null, level: number =0, plan? : string) : string {

    if (!agentDescription || !teamDescription) {
        throw new Error('Agent description and team description are required to generate steps');
    }
    
    const systemPrompt : LLMMessage = {
        role: 'system',
        // TODO : Other teams include: IT team, HR team, Finance team, Marketing team, Sales team, Customer Service team, Operations team, Legal team, R&D team, and Executive team.
        content: `You work in an Asset Management firm called "Nard AI" where you are part of the ${agentDescription.teamType}. Your name is ${name}.\n Here is a brief about what your team's duties and objectives: ${teamDescription}\n As part of your duties the ${agentDescription.teamType}, you make plans and you take actions but you also have your own agenda : ${agentDescription.plan}. \n To structure your plan, you use the XML syntax which allows to nest subtasks within tasks.\n When generating an XML representation of tasks, please follow these guidelines:\n 1 - Each task should be enclosed in a <task> tag.\n 2 - apart from id and depth, attributes should be included as separate child elements within the <task> tag.\n 3 - some elements may be optional, only include optional elements if they have a value.\n
        Use the following structure for each task:<task id="[unique_id]" depth="[depth_number]">
        <description>[task_description]</description>
        <status>["TODO" | "completed" | "inProgress"]</status>
        <!-- Optional elements below -->
        <keyTakeaways>[key_takeaways]</keyTakeaways>
        <startTime>[start_time]</startTime>
        <finishBefore>[finish_before_time]</finishBefore>
        <requiredTeams>
          <team>[team_name]</team>
          <!-- Add more team tags as needed -->
        </requiredTeams>
        <requiredAgents>
          <agent>[agent_name]</agent>
          <!-- Add more agent tags as needed -->
        </requiredAgents>
        <tasks>
        <!-- Nested tasks would go here -->
        </tasks>
      </task>
      
      Example with optional elements and nesting:
      <tasks>
        <task id="1" depth="0">
            <description>Plan project kickoff</description>
            <status>inProgress</status>
            <keyTakeaways>Establish project goals and timeline</keyTakeaways>
            <startTime>2023-07-15T09:00:00</startTime>
            <requiredTeams>
                <team>investor relations</team>
                <team>senior management</team>
            </requiredTeams>
            <tasks>
                <task id="3" depth="1">
                    <description>Prepare presentation slides</description>
                    <status>Not Started</status>
                    <finishBefore>2023-07-14T17:00:00</finishBefore>
                </task>
            </tasks>
        </task>
        <task id="2" depth="0">
            <description>Conduct team meeting</description>
            <status>TODO</status>
            <requiredAgents>
                <agent>Team Lead</agent>
            </requiredAgents>
        </task>
    </tasks>`
    };

    const prompt : string[] = ['[no prose]'];

    if (!plan) {
        prompt.push(`You have not started to establish a plan yet. At first, you need to need to define up to 5 key tasks consistent with your professional duties and your personal objectives. Each of these tasks must be enclosed in a <task> tag, do not include subtasks at this stage, we will iterate based on the initial choice.`);
    }
    else {
        prompt.push(`You have already started to establish the following list of tasks taking into account your professional duties and your personal objectives : ${plan}`);
        prompt.push(`You need to add subtasks for eact tasks of depth ${level-1}. You can only add a maximum of ${5-level} subtasks for each task of depth ${level-1}. Do not change existing tasks. You can only add new subtasks. All subtasks of a parent task mus be enclosed in a<tasks> tag`);
    }

    prompt.push('Please generate a list of tasks following this format, ensuring proper nesting and including relevant optional elements where appropriate.','[no prose]')

    const llmMessages: LLMMessage[] = [
        systemPrompt,
        {
        role: 'user',
        content: prompt.join('\n'),
        },
    ];
    llmMessages.push({ role: 'assistant', content: `<tasks>` });

    const { content } = await chatCompletion({
        messages: llmMessages,
        stop: '</tasks>',
    });
//   return content;

//   try {
//     const insights = JSON.parse(reflection) as { insight: string; statementIds: number[] }[];
//     const memoriesToSave = await asyncMap(insights, async (item) => {
//       const relatedMemoryIds = item.statementIds.map((idx: number) => memories[idx]._id);
//       const importance = await calculateImportance(item.insight);
//       const { embedding } = await fetchEmbedding(item.insight);
//       console.debug('adding reflection memory...', item.insight);
//       return {
//         description: item.insight,
//         embedding,
//         importance,
//         relatedMemoryIds,
//       };
//     });

//     await ctx.runMutation(selfInternal.insertReflectionMemories, {
//       worldId,
//       playerId,
//       reflections: memoriesToSave,
//     });
//   } catch (e) {
//     console.error('error saving or parsing reflection', e);
//     console.debug('reflection', reflection);
//     return false;
//   }
//   return true;
}

