import { ObjectType, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { agentId, teamId, parseGameId, GameId } from './ids';
import { SerializedTeam } from './team';
import { SerializedAgentDescription } from './agentDescription';
import { xmlTasks } from '../agent/planning';
import { LLMMessage, chatCompletion } from '../util/llm';
import { SerializedPlayerDescription } from './playerDescription';
import { memo } from 'react';

// not sure we actually need a class here. 
// export type Task = Doc<'tasks'>; may do the job

export const serializedTask = {
    id: v.id('tasks'),
    planId: v.id('plans'),
    description: v.string(),
    parentTaskId: v.optional(v.id('tasks')),
    nthChild: v.optional(v.number()),
    status: v.union(v.literal('TODO'), v.literal('completed'), v.literal('inProgress')),
    keyTakeaways: v.optional(v.string()),
    startTime: v.optional(v.number()),
    finishBefore: v.optional(v.number()),
    requiredTeams: v.optional(v.array(teamId)),
    requiredAgents: v.optional(v.array(agentId)),
};

export type SerializedTask = ObjectType<typeof serializedTask>;

export class Task {
    id: Id<'tasks'>;
    planId: Id<'plans'>;
    description: string;
    parentTaskId?: Id<'tasks'>;
    nthChild?: number;
    status: "TODO" | "completed" | "inProgress";
    keyTakeaways?: string;
    startTime?: number;
    finishBefore?: number;
    requiredTeams?: GameId<'teams'>[];
    requiredAgents?: GameId<'agents'>[];

    constructor(serialized: SerializedTask) {
        const { id, planId, description, parentTaskId, nthChild, status, keyTakeaways, startTime, finishBefore} = serialized;
        this.id = id;
        this.planId = planId;
        this.description = description;
        this.parentTaskId = parentTaskId;
        this.nthChild = nthChild;
        this.status = status;
        this.keyTakeaways = keyTakeaways;
        this.startTime = startTime;
        this.finishBefore = finishBefore;
        this.requiredTeams = serialized.requiredTeams 
            ? serialized.requiredTeams.map((id:string) => parseGameId('teams', id)) 
            : undefined;
        this.requiredAgents = serialized.requiredAgents 
            ? serialized.requiredAgents.map((id:string) => parseGameId('agents', id)) 
            : undefined;
    };

    serialize(): SerializedTask {
        return {
            id: this.id,
            planId: this.planId,
            description: this.description,
            parentTaskId: this.parentTaskId,
            nthChild: this.nthChild,
            status: this.status,
            keyTakeaways: this.keyTakeaways,
            startTime: this.startTime,
            finishBefore: this.finishBefore,
            requiredTeams: this.requiredTeams,
            requiredAgents: this.requiredAgents,
        };
    };
}

export async function generateTasks(
    args: {
        teams : SerializedTeam[], 
        playerDescription: SerializedPlayerDescription, 
        agentDescription : SerializedAgentDescription,
        xmlPlan?: string|undefined, 
        conversationHistory?: string,
        otherAgent?: string, 
        level?: number, 
        memoriesByTask? : string [] 
    }
  ) {

    const {xmlPlan, conversationHistory, level, otherAgent, memoriesByTask} = args;
    const teamDescription = args.teams.find((t) => t.name === args.agentDescription?.teamType);

    const tasks = await getSubtasks(
        args.teams, 
        args.agentDescription, 
        args.playerDescription, 
        teamDescription?.name, 
        level, 
        xmlPlan, 
        conversationHistory, 
        otherAgent,
        memoriesByTask
    );

   return tasks;
}

async function getSubtasks(
    teams:SerializedTeam[],
    agentDescription:SerializedAgentDescription,
    playerDescription:SerializedPlayerDescription,
    teamDescription:string | undefined,
    level: number | undefined,
    xmlPlan: string | undefined,
    conversationHistory: string | undefined,
    otherAgent: string | undefined, 
    memoriesByTask: string[] | undefined
){
    const depth = level || 0;
    const playerName = playerDescription.name;
    const systemPrompt : LLMMessage = {
        role: 'system',
        content: `You work in an Asset Management firm called "Nard AI" where you are part of the ${agentDescription?.teamType}. Your name is ${playerName}.\n Here is a brief about what your team's duties and objectives: ${teamDescription}\n As part of your duties the ${agentDescription?.teamType}, you make plans and you take actions but you also have your own agenda : ${agentDescription?.plan}. \n To structure your plan, you use the XML syntax which allows to nest subtasks within tasks.\n When generating an XML representation of tasks, please follow these guidelines:\n 1 - Each task should be enclosed in a <task> tag.\n 2 - apart from id and depth, attributes should be included as separate child elements within the <task> tag.\n 3 - some elements may be optional, only include optional elements if they have a value.\n 4 - after marking a task as completed, you can write your key takeaways between <keyTakeaways> tags.\n 5 - the response must be parseable as XML using DOMParser.\n 
        Use the following structure for each task:<task id="[unique_id]" depth="[depth_number]">
        <description>[task_description]</description>
        <status>["TODO" | "completed" | "inProgress"]</status>
        <!-- if tasks need to be completed in a certain order, include the position in the sequence -->
        <nthChild>[nth_child]</nthChild>    
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
      
      The list of teams in the company  are : ${teams.map((t) => `${t.name}: ${t.description}`).join('\n')}

      Example with optional elements and nesting:
      <tasks>
        <task id="1" depth="0">
            <description>Plan project kickoff</description>
            <status>inProgress</status>
            <nthChild>0</nthChild>  
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
            <nthChild>1</nthChild>  
            <requiredAgents>
                <agent>Team Lead</agent>
            </requiredAgents>
        </task>
    </tasks>`
    };

    const prompt : string[] = [];

    if (conversationHistory && otherAgent) {
        prompt.push(`you just finished a conversation with ${otherAgent} which may have contained important insights. The conversation is detailed below:\n ${conversationHistory}`);
    }

    if (!xmlPlan) {
        prompt.push(`You have not started to establish a plan yet. At first, you need to define up to 5 key tasks consistent with your professional duties and your personal objectives. Each of these tasks must be enclosed in a <task> tag, do not include subtasks at this stage, we will iterate based on the initial choice.`);
    }
    else {
        prompt.push(`You have already started to establish the following list of tasks taking into account your professional duties and your personal objectives : ${xmlPlan}`);
        if (memoriesByTask) {
            prompt.push(`Based on your past experiences, you have the following memories related to tasks in your previous plan :\n ${memoriesByTask.join('\n')}`);
        }
        prompt.push(`You need to adjust ot add subtasks for each task of depth ${depth}. You can only add a maximum of ${5-(depth)} subtasks for each task of depth ${depth}}. Do not change to tasks if their depth is below ${depth}. All subtasks of a parent task must be enclosed in a <tasks> tag`);
    }

    prompt.push('Please generate a list of tasks following the xml format, ensuring proper nesting and including relevant optional elements where appropriate.','[no prose]')

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
        //stop: '</tasks>',
    });

    const taskList = parseXMLTasks(content);

    const allTasks = flattenTasks(taskList);

    let retainedTasks = allTasks.filter((t) => t.depth <= (level || 0));

    // if depth is less than 2, we can add subtasks (depth of 2 would represent 60 subtasks)
    if (depth <2) {
        const newLevel = depth + 1;
        const newXmlTasks = xmlTasks(retainedTasks);
        const subTaskList = await getSubtasks(
            teams, 
            agentDescription, 
            playerDescription, 
            teamDescription, 
            newLevel, 
            newXmlTasks, 
            conversationHistory, 
            otherAgent,
            memoriesByTask
            );

        retainedTasks = [...retainedTasks,...subTaskList];
    }

    return retainedTasks;
}

function parseXMLTasks(xml: string) {

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, "text/xml");

    function parseTask (taskElement: Element, parentChainId: string = '', index:number): any {
        const task: any = {
          id: parentChainId
            ? [parentChainId,index.toString()].join(".")
            : index.toString(), // old : taskElement.getAttribute("id"),
          depth: parentChainId
            ? parentChainId.split(".").length 
            : 0, // old : parseInt(taskElement.getAttribute("depth") || "0"),
          description: taskElement.querySelector("description")?.textContent || "",
          status: taskElement.querySelector("status")?.textContent || "",
          nthChild: index //old : parseInt(taskElement.querySelector("nthChild")?.textContent || "0"),
        };
  
        // Parse optional elements
        const keyTakeaways = taskElement.querySelector("keyTakeaways")?.textContent;
        if (keyTakeaways) task.keyTakeaways = keyTakeaways;
  
        const startTime = taskElement.querySelector("startTime")?.textContent;
        if (startTime) task.startTime = new Date(startTime);
  
        const finishBefore = taskElement.querySelector("finishBefore")?.textContent;
        if (finishBefore) task.finishBefore = new Date(finishBefore);
  
        task.requiredTeams = Array
            .from(taskElement.querySelectorAll("requiredTeams > team"))
            .map(team => team.textContent);

        task.requiredAgents = Array
            .from(taskElement.querySelectorAll("requiredAgents > agent"))
            .map(agent => agent.textContent);
  
        // Parse nested tasks
        const nestedTasks = taskElement.querySelector("tasks");
        if (nestedTasks) {
            task.xmltasks = nestedTasks.innerHTML;
            task.tasks = Array
            .from(nestedTasks.children)
            .map((childElement,index)=>parseTask(childElement, task.id, index));
        }
  
        return task;
      };

    const tasks = Array.from(xmlDoc.querySelectorAll("tasks > task")).map((element,index)=>parseTask(element, '', index));

    return tasks;
}

function flattenTasks(tasks: any[]): any[] {
    return tasks.reduce((acc: any[], task: any) => {
        acc.push(task);
        if (task.tasks) {
            acc.push(...flattenTasks(task.tasks));
            delete task.tasks;  // Optional: remove the 'tasks' property to avoid redundancy
        }
        return acc;
    }, []);
}

export const insertTasks = internalMutation({
    args: {
      worldId: v.id('worlds'),
      planId: v.id('plans'),
      tasks: v.array(
        v.object(serializedTask),
      ),
    },
    handler: async (ctx, args) => {
        if (!args.tasks || args.tasks.length == 0) {
            throw new Error('No tasks to insert');
          }
        for (const task of args.tasks) {
            await ctx.db.insert('tasks', {
                worldId: args.worldId,
                planId: args.planId,
                id : task.id,
                description: task.description,
                parentTaskId: task.parentTaskId,
                nthChild: task.nthChild,
                status: task.status,
                keyTakeaways: task.keyTakeaways,
                startTime: task.startTime,
                finishBefore: task.finishBefore,
                requiredTeams: task.requiredTeams,
                requiredAgents: task.requiredAgents
            });
        }
    },
  });





