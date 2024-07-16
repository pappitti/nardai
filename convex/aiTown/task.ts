import { ObjectType, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { agentId, teamId, parseGameId, GameId } from './ids';
import { SerializedTeam } from './team';
import { SerializedAgentDescription } from './agentDescription';
import { xmlTasks } from '../agent/planning';
import { LLMMessage, chatCompletion } from '../util/llm';
import { SerializedPlayerDescription } from './playerDescription';
import { XMLParser } from 'fast-xml-parser';

// not sure we actually need a class here. 
// export type Task = Doc<'tasks'>; may do the job

export const serializedTask = {
    taskId: v.string(),
    planId: v.id('plans'),
    description: v.string(),
    depth: v.number(),
    parentTaskId: v.optional(v.string()),
    nthChild: v.optional(v.number()),
    status: v.union(v.literal('TODO'), v.literal('completed'), v.literal('inProgress')), 
    keyTakeaways: v.optional(v.string()),
    startTime: v.optional(v.number()),
    finishBefore: v.optional(v.number()),
    requiredTeams: v.optional(v.array(v.string())), 
    requiredAgents: v.optional(v.array(v.string())), 
};

export type SerializedTask = ObjectType<typeof serializedTask>;

export class Task {
    taskId: string;
    planId: Id<'plans'>;
    description: string;
    parentTaskId?: string;
    depth: number;
    nthChild?: number;
    status: "TODO" | "completed" | "inProgress";
    keyTakeaways?: string;
    startTime?: number;
    finishBefore?: number;
    requiredTeams?: string[];
    requiredAgents?: string[];

    constructor(serialized: SerializedTask) {
        const { taskId, planId, description, parentTaskId, depth, nthChild, status, keyTakeaways, startTime, finishBefore, requiredTeams, requiredAgents} = serialized;
        this.taskId = taskId;
        this.planId = planId;
        this.description = description;
        this.parentTaskId = parentTaskId;
        this.depth = depth;
        this.nthChild = nthChild;
        this.status = status;
        this.keyTakeaways = keyTakeaways;
        this.startTime = startTime;
        this.finishBefore = finishBefore;
        this.requiredTeams = requiredTeams
        this.requiredAgents = requiredAgents
    };

    serialize(): SerializedTask {
        return {
            taskId: this.taskId,
            planId: this.planId,
            description: this.description,
            parentTaskId: this.parentTaskId,
            depth: this.depth,
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
        allPlayersNames: string[], 
        playerDescription: SerializedPlayerDescription, 
        agentDescription : SerializedAgentDescription,
        xmlPlan?: string|undefined, 
        conversationHistory?: string,
        otherAgent?: string, 
        memoriesByTask? : string [] 
    }
  ) {

    const {xmlPlan, conversationHistory, /*level,*/ otherAgent, memoriesByTask} = args;
    const teamDescription = args.teams.find((t) => t.name === args.agentDescription?.teamType);
    const level = 0

    const tasks = await getSubtasks(
        args.teams, 
        args.allPlayersNames,
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
    allPlayersNames:string[],
    agentDescription:SerializedAgentDescription,
    playerDescription:SerializedPlayerDescription,
    teamDescription:string | undefined,
    level: number,
    xmlPlan: string | undefined,
    conversationHistory: string | undefined,
    otherAgent: string | undefined, 
    memoriesByTask: string[] | undefined
) : Promise<any[] | undefined> {
    const depth = level || 0;
    const allTeamsNames = teams.map((t) => t.name); 
    const playerName = playerDescription.name;
    const systemPrompt : LLMMessage = {
        role: 'system',
        content: `You work in an Asset Management firm called "Nard AI" where you are part of the ${agentDescription?.teamType}. Your name is ${playerName}.\n Here is a brief about what your team's duties and objectives: ${teamDescription}\n As part of your duties in the ${agentDescription?.teamType}, you make plans and you take actions but you also have your own agenda : ${agentDescription?.plan}. \n To structure your plan, you use the XML syntax which allows to nest subtasks within tasks.\n When generating an XML representation of tasks, please follow these guidelines:\n 1 - Each task should be enclosed in a <task> tag.\n 2 - apart from id and depth, attributes should be included as separate child elements within the <task> tag.\n 3 - some elements may be optional, only include optional elements if they have a value.\n 4 - after marking a task as completed, you can write your key takeaways between <keyTakeaways> tags.\n 5 - the response must be parseable as XML using fast-xml-parser.\n 
        Use the following structure for each task:
        <task id="[unique_id]" depth="[depth_number]">
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
            <startTime>2023-07-15T09:00:00</startTime>
            <requiredTeams>
                <team>investor relations</team>
                <team>senior management</team>
            </requiredTeams>
            <tasks>
                <task id="3" depth="1">
                    <description>Ask Lucky to do a market mapping</description>
                    <status>completed</status>
                    <keyTakeways>Lucky accepted the task and will come back to me within 24 hours so I can add the mapping in my presentation slides</keyTakeways>
                    <requiredAgents>
                        <agent>Lucky</agent>
                    </requiredAgents>
                </task>
                <task id="4" depth="1">
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

    if (!xmlPlan && depth === 0) {
        prompt.push(`You have not started to establish a plan yet. At first, you need to define up to 5 key tasks consistent with your professional duties and your personal objectives. Each of these tasks must be enclosed in a <task> tag, do not include subtasks at this stage, we will iterate based on the initial choice.`);
    }
    else if (!xmlPlan && depth > 0) {
        prompt.push(`You have not started to establish a plan yet. At this stage, you need to add subtasks for each task up to depth ${depth}. You can only add a maximum of 5 subtasks for each task of depth 0 ${depth>=1?"and 4 at depth 1":""}${depth==2?"and 3 at depth 2":""}. Do not change to tasks if their depth is below ${depth}. All subtasks of a parent task must be enclosed in a <tasks> tag`);
    }
    else {
        prompt.push(`You have already started to establish the following list of tasks taking into account your professional duties and your personal objectives : ${xmlPlan}`);
        if (memoriesByTask) {
            prompt.push(`Based on your past experiences, you have the following memories related to tasks in your existing plan :\n ${memoriesByTask.join('\n')}`);
        }
        prompt.push(`You need to adjust or add subtasks for each task of depth ${depth}. You can only add a maximum of ${5-depth} subtasks for each task of depth ${depth}. Do not change to tasks if their depth is lower than ${depth}. You can mark as "completed" the tasks that you identify as redundant but you should mention the reason in keyTakeways. All subtasks of a parent task must be enclosed in a <tasks> tag`);
    }

    prompt.push('Please generate a list of tasks following the xml format, ensuring proper nesting and including relevant optional elements where appropriate.','[no prose]')

    const llmMessages: LLMMessage[] = [
        systemPrompt,
        {
        role: 'user',
        content: prompt.join('\n'),
        },
    ];
    llmMessages.push({ role: 'assistant', content: `Proposed plan following the XML format:` });

    const { content } = await chatCompletion({
        messages: llmMessages,
        //stop: '</tasks>',
    });

    let retainedTasks

    try {
        const taskList = parseXMLTasks(content);

        if (!taskList || taskList.length === 0) {
            console.warn("No tasks parsed from XML");
        } else {
            const allTasks = flattenTasks(taskList, depth);

            // can probably do better than this
            for (const task of allTasks) {
                if (task.requiredTeams) {
                    const filteredTeams = task.requiredTeams.filter((t:string) => allTeamsNames.includes(t));
                    task.requiredTeams = filteredTeams;
                }
                if (task.requiredAgents) {
                    const filteredAgents = task.requiredAgents.filter((a:string) => allPlayersNames.includes(a));
                    task.requiredAgents = filteredAgents;
                }
                if (!["TODO","completed","inProgress"].includes(task.status)){
                    task.status = "TODO";
                }
            }

            retainedTasks = allTasks.filter((t) => t.depth <= depth);   
        }
    } catch (e) {
        console.error("Error parsing XML or processing tasks:", e);
    }

    // if depth is less than 2, we can add subtasks (depth of 2 would represent 60 subtasks)
    if (depth <2) {
        const newLevel = depth + 1;
        const newXmlTasks = retainedTasks && xmlTasks(retainedTasks);
        const subTaskList = await getSubtasks(
            teams, 
            allPlayersNames,
            agentDescription, 
            playerDescription, 
            teamDescription, 
            newLevel, 
            newXmlTasks, 
            conversationHistory, 
            otherAgent,
            memoriesByTask
            );

        if (subTaskList){
            retainedTasks = [...subTaskList];
        }
    }

    return retainedTasks;
}

function parseXMLTasks(xml: string) {

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        alwaysCreateTextNode: true
      });
    const xmlDoc = parser.parse(xml);

    function parseISODate(dateString: string): number | null {
        const timestamp = Date.parse(dateString);
        return isNaN(timestamp) ? null : timestamp;
    }

    function parseTask (taskElement: any, parentChainId: string = '', index:number): any {
        const task: any = {
            taskId: parentChainId
                ? [parentChainId,index.toString()].join(".")
                : index.toString(), // old : taskElement.getAttribute("id"),
            depth: parentChainId
                ? parentChainId.split(".").length 
                : 0, // old : parseInt(taskElement.getAttribute("depth") || "0"),
            description: taskElement.description?.["#text"] || "",
            status: taskElement.status?.["#text"] || "",
            nthChild: index, //old : parseInt(taskElement.querySelector("nthChild")?.textContent || "0"),
            parentTaskId: parentChainId,
        };
  
        // Parse optional elements
        if (taskElement.keyTakeaways) {
            task.keyTakeaways = taskElement.keyTakeaways["#text"];
        }
    
        if (taskElement.startTime) {
            const parsedDate = parseISODate(taskElement.startTime["#text"]);
            if (parsedDate) task.startTime = parsedDate;
        }
    
        if (taskElement.finishBefore) {
            const parsedDate = parseISODate(taskElement.finishBefore["#text"]);
            if (parsedDate) task.finishBefore = parsedDate;
      }
  
        // Parse required teams
        task.requiredTeams = [];
        if (taskElement.requiredTeams && taskElement.requiredTeams.team) {
            if (Array.isArray(taskElement.requiredTeams.team)) {
                task.requiredTeams = taskElement.requiredTeams.team.map((team: any) => team["#text"]);
            } else {
                task.requiredTeams = [taskElement.requiredTeams.team["#text"]];
            }
        }

        // Parse required agents
        task.requiredAgents = [];
        if (taskElement.requiredAgents && taskElement.requiredAgents.agent) {
            if (Array.isArray(taskElement.requiredAgents.agent)) {
                task.requiredAgents = taskElement.requiredAgents.agent.map((agent: any) => agent["#text"]);
            } else {
                task.requiredAgents = [taskElement.requiredAgents.agent["#text"]];
            }
        }
  
        // Parse nested tasks
        if (taskElement.tasks && taskElement.tasks.task) {
            //task.subtasks = JSON.stringify(taskElement.tasks);
            if (Array.isArray(taskElement.tasks.task)) {
                task.tasks = taskElement.tasks.task.map((childElement: any, childIndex: number) =>
                    parseTask(childElement, task.taskId, childIndex)
                );
            } else {
                task.tasks = [parseTask(taskElement.tasks.task, task.taskId, 0)];
            }
        }
  
        return task;
      };

    const tasks = xmlDoc.tasks && xmlDoc.tasks.task
      ? Array.isArray(xmlDoc.tasks.task)
        ? xmlDoc.tasks.task.map((element: any, index: number) => parseTask(element, '', index))
        : [parseTask(xmlDoc.tasks.task, '', 0)]
      : [];

    return tasks;
}

function flattenTasks(tasks: any[], depth:number): any[] {
    return tasks.reduce((acc: any[], task: any) => {
        acc.push(task);
        if (task.tasks) {

            // recursively flatten subtasks only up to the specified depth
            if (depth-1 >=0 ){
                acc.push(...flattenTasks(task.tasks, depth-1));
                delete task.tasks;  // then we can remove the 'tasks' property to avoid redundancy
            }
            else { // otherwise, keep the subtasks as a xml string
                task.subtasks = xmlTasks(task.tasks);
            }
        }
        return acc;
    }, []);
}

export const insertTasks = internalMutation({
    args: {
      worldId: v.id('worlds'),
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
                planId: task.planId,
                taskId: task.taskId,
                description: task.description,
                parentTaskId: task.parentTaskId,
                depth: task.depth,
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





