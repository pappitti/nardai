import { ObjectType, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { agentId, teamId, parseGameId, GameId } from './ids';
import { SerializedTeam } from './team';
import { SerializedAgentDescription } from './agentDescription';
import { jsonTasks} from '../agent/planning';
import { LLMMessage, chatCompletion } from '../util/llm';
import { SerializedPlayerDescription } from './playerDescription';

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
    subtasks: v.optional(v.array(v.string())) 
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
    subtasks?: string[];

    constructor(serialized: SerializedTask) {
        const { taskId, planId, description, parentTaskId, depth, nthChild, status, keyTakeaways, startTime, finishBefore, requiredTeams, requiredAgents, subtasks} = serialized;
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
        this.requiredTeams = requiredTeams;
        this.requiredAgents = requiredAgents;
        this.subtasks = subtasks;
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
            subtasks: this.subtasks
        };
    };
}

export const taskSchema = {
    "type": "Task",
    "properties": {
        "taskId": {
        "type": "string",
        "description": "Unique identifier for the task, it is direclty derived from the parent taskId (if any) and the index of the task in the list of subtasks. For example, the first subtask of the task with taskId 0 would have taskId 0.1"
        },
        "description": {
        "type": "string",
        "description": "Description of the task"
        },
        "parentTaskId": {
        "type": "string",
        "description": "taskId of the parent task in the hierarchy, if any. For example, if the taskID is 1.2, the parentTaskId would be 1"
        },
        "status": {
        "type": "string",
        "enum": ["TODO", "completed", "inProgress"]
        },
        "keyTakeaways": {
        "type": "string", 
        "description": "Important insights and learnings from the task once completed"
        },
        "startTime": {
        "type": "number",
        "description": "Unix timestamp for the start time of the task"
        },
        "finishBefore": {
        "type": "number", 
        "description": "Unix timestamp for the deadline of the task"
        },
        "requiredTeams": {
        "type": "array",
        "items": {
            "type": "string",
            "description": "Name of the team"
        },
        "description": "Teams required to complete the task"
        },
        "requiredAgents": {
        "type": "array",
        "items": {
            "type": "string", 
            "description": "Name of the agent"
        },
        "description": "Agents required to complete the task"
        },
        "subtasks": {
        "type": "array",
        "items": {
            "type": "Task",
            "description": "subtask of the task"
        },
        "description": "List of subtasks"
        }
    },
    "required": ["taskId", "description", "status"]
}

export async function generateTasks(
    args: {
        teams : SerializedTeam[],
        allPlayersNames: string[], 
        playerDescription: SerializedPlayerDescription, 
        agentDescription : SerializedAgentDescription,
        jsonPlan?: string|undefined, 
        conversationHistory?: string,
        otherAgent?: string, 
        memoriesByTask? : string [] 
    }
  ) {

    const {jsonPlan, conversationHistory, /*level,*/ otherAgent, memoriesByTask} = args;
    const teamDescription = args.teams.find((t) => t.name === args.agentDescription?.teamType);
    const level = 0

    const tasks = await getSubtasks(
        args.teams, 
        args.allPlayersNames,
        args.agentDescription, 
        args.playerDescription, 
        teamDescription?.name, 
        level, 
        jsonPlan, 
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
    jsonPlan: string | undefined,
    conversationHistory: string | undefined,
    otherAgent: string | undefined, 
    memoriesByTask: string[] | undefined,
    retryCount: number = 0
) : Promise<any[] | undefined> {
    const depth = level || 0;
    const allTeamsNames = teams.map((t) => t.name); 
    const playerName = playerDescription.name;
    const systemPrompt : LLMMessage = {
        role: 'system',
        content: `You are an AI agent tasked with generating and updating project plans for an Asset Management firm called "Nard AI". Your name is ${playerDescription.name} and you are part of the ${agentDescription?.teamType} team. 
        Team duties and objectives: ${teamDescription}
        Your personal agenda: ${agentDescription?.plan}
        The list of agents in the company : ${allPlayersNames.join(', ')}
        The list of teams in the company : ${teams.map((t) => `${t.name}: ${t.description}`).join('\n')}
        Output should be a valid JSON array of tasks following this schema:
        ${taskSchema}`
    };

    const prompt : string[] = [];

    const userPrompt = `
    ${conversationHistory ? `Recent conversation with ${otherAgent}: ${conversationHistory}` : ''}
    ${jsonPlan ? `Existing tasks: ${JSON.stringify(jsonPlan, null, 2)}` : 'No existing plan.'}
    ${memoriesByTask ? `Relevant memories: ${memoriesByTask.join('\n')}` : ''}

    Instructions:
    1. If no existing tasks, create up to 5 high-level tasks.
    2. If updating, focus on tasks at the current depth. You can add, modify, or mark tasks as completed.
    3. Add a maximum of ${5 - depth} subtasks for each task at the current depth.
    4. Maintain consistency with previous tasks and incorporate relevant information from memories and conversations.
    5. Ensure all required fields are filled and optional fields are included when relevant.
    6. When marking a task as completed, write what you learnt and other important insights that are relevant for the rest of the plan.
    7. Output must be a valid JSON array of tasks following the schema provided, ONLY in the following format <generatedTasks>{array_of_tasks}</generatedTasks>.
    8. Use Unix timestamps for startTime and finishBefore fields.

    For example:
    <generatedTasks>
    [{
        taskId: "0",
        description: "Automate monitoring processes for the investment team",
        status: "TODO",
        requiredTeams: ["IT team", "investment team"],
        subtasks:
            [
            {
                taskId: "0.1",
                description: "Get names of contact points in the IT team",
                parentTaskId: "0",
                status: "TODO",
                requiredTeams: ["IT team"]
            },
            {
                taskId: "0.2",
                description: "Plan project kickoff",
                parentTaskId: "0",
                status: "InProgress",
                requiredTeams: ["IT team", "investment team"],
                requiredAgents: ["Lucky"]
            } 
            ]
        },
        {
            taskId: "1",
            description: "Review investment strategy for Q3",
            status: "Completed",
            requiredTeams: ["senior management"],
            keyTakeaways: "Presented to the Board three key areas for improvement: risk management, diversification, and client engagement."
        }
    ]
    </generatedTasks>


    [no prose]
    `;

    const llmMessages: LLMMessage[] = [
        systemPrompt,
        {
        role: 'user',
        content: userPrompt,
        },
    ];
    llmMessages.push({ role: 'assistant', content: `<generatedTasks>` });

    let retainedTasks

    try {
        const { content } = await chatCompletion({
            messages: llmMessages,
            stop: '</generatedTasks>',
        });

    
        const cleanedJSON = preprocessJSON(content);
        console.log('cleanedJson:', cleanedJSON );
        const parsedTasks = JSON.parse(cleanedJSON);
        console.log('parsedTasks:', parsedTasks );

        retainedTasks = parsedTasks
            .map((task:any,index:number)=>parseJSONTasks(task, '', index))
            .flat()
            .filter((t:any) => t.depth <= depth);

        console.log('retained tasks:', retainedTasks );

        if (!retainedTasks || retainedTasks.length === 0) {
            console.warn("Error with tasks parsed from parsable json response");
        } 

        for (const task of retainedTasks) {
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

    } catch (e) {
        console.error('Error in task generation:', e);
        
        // Retry mechanism
        if (retryCount < 3) {
            console.log(`Retrying task generation (attempt ${retryCount + 1})`);
            return await getSubtasks(
                teams, 
                allPlayersNames,
                agentDescription, 
                playerDescription, 
                teamDescription, 
                level, 
                jsonPlan, 
                conversationHistory, 
                otherAgent,
                memoriesByTask, 
                retryCount + 1
            );
        } else {
            throw new Error('Failed to generate valid tasks after multiple attempts');
        }
    }

    // if depth is less than 2, we can add subtasks (depth of 2 would represent 60 subtasks)
    if (depth <2) {
        const newLevel = depth + 1;
        const newJSONTasks = retainedTasks && jsonTasks(retainedTasks);
        const subTaskList = await getSubtasks(
            teams, 
            allPlayersNames,
            agentDescription, 
            playerDescription, 
            teamDescription, 
            newLevel, 
            newJSONTasks, 
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


// trusting Claude on this one
function preprocessJSON(jsonString: string): string {
    let cleaned = jsonString;
  
    // Step 1: Remove comments
    cleaned = cleaned.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
    // Step 2: Remove newline characters
    cleaned = cleaned.replace(/\n/g, '');
  
    // Step 3: Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
    // Step 4: Ensure the input is wrapped in square brackets if it's not already an array
    if (!cleaned.startsWith('[')) {
      cleaned = `[${cleaned}]`;
    }
  
    // Step 5: Handle property names
    cleaned = cleaned.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, (match, prefix, key) => `${prefix}"${key}":`);
  
    // Step 6: Handle string values and escape single quotes
    cleaned = cleaned.replace(/"([^"]*)":\s*'([^']*)'/g, (match, key, value) => {
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      return `"${key}":"${escapedValue}"`;
    });
  
    // Step 7: Replace any remaining single quotes with double quotes
    cleaned = cleaned.replace(/'/g, '"');
  
    // Step 8: Remove trailing commas
    cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  
    return cleaned;
  }

// TODO : types
function parseJSONTasks(generatedTask: any, parentChainId: string = '', index:number) : any[] {
     const {description, status, keyTakeaways, startTime, finishBefore, requiredTeams, requiredAgents} = generatedTask;
    
    const task: any = {
        taskId: parentChainId
            ? [parentChainId,index.toString()].join(".")
            : index.toString(), // old : taskElement.getAttribute("id"),
        depth: parentChainId
            ? parentChainId.split(".").length 
            : 0, // old : parseInt(taskElement.getAttribute("depth") || "0"),
        description: description || "", // should never be an empty string given check above
        status: status || "",
        nthChild: index, //old : parseInt(taskElement.querySelector("nthChild")?.textContent || "0"),
        parentTaskId: parentChainId || undefined,
        keyTakeaways : keyTakeaways || undefined,
        startTime: startTime || undefined,
        finishBefore: finishBefore || undefined,
        requiredTeams: typeof requiredTeams === 'string' ? [requiredTeams] : requiredTeams,
        requiredAgents: typeof requiredAgents === 'string' ? [requiredAgents] : requiredAgents
    };

    // Parse nested tasks
    let children;
    if (generatedTask.subtasks && generatedTask.subtasks.length > 0) {
        //task.subtasks = JSON.stringify(taskElement.tasks);
        if (Array.isArray(generatedTask.subtasks)) {
            children = generatedTask.subtasks.map((childElement: any, childIndex: number) =>
                parseJSONTasks(childElement, task.taskId, childIndex)
            );
        } else {
            children  = [parseJSONTasks(generatedTask.subtasks, task.taskId, 0)];
        }
    }
    console.log('task', task);
    return [task, ...(children||[])]

}

// function parseXMLTasks(xml: string) {

//     const parser = new XMLParser({
//         ignoreAttributes: false,
//         attributeNamePrefix: "@_",
//         alwaysCreateTextNode: true
//       });
//     const xmlDoc = parser.parse(xml);

//     function parseISODate(dateString: string): number | null {
//         const timestamp = Date.parse(dateString);
//         return isNaN(timestamp) ? null : timestamp;
//     }

//     function parseTask (taskElement: any, parentChainId: string = '', index:number): any {

//         let description = taskElement.description?.["#text"] ?? taskElement["@_description"] ?? taskElement["@_name"] ?? taskElement["#text"]; // common error from model
//         if (!description) {
//             console.error("Task missing description", taskElement);
//             return;
//         }
        
//         const task: any = {
//             taskId: parentChainId
//                 ? [parentChainId,index.toString()].join(".")
//                 : index.toString(), // old : taskElement.getAttribute("id"),
//             depth: parentChainId
//                 ? parentChainId.split(".").length 
//                 : 0, // old : parseInt(taskElement.getAttribute("depth") || "0"),
//             description: description || "", // should never be an empty string given check above
//             status: taskElement.status?.["#text"] || "",
//             nthChild: index, //old : parseInt(taskElement.querySelector("nthChild")?.textContent || "0"),
//             parentTaskId: parentChainId,
//         };
  
//         // Parse optional elements
//         if (taskElement.keyTakeaways) {
//             task.keyTakeaways = taskElement.keyTakeaways["#text"];
//         }
    
//         if (taskElement.startTime) {
//             const parsedDate = parseISODate(taskElement.startTime["#text"]);
//             if (parsedDate) task.startTime = parsedDate;
//         }
    
//         if (taskElement.finishBefore) {
//             const parsedDate = parseISODate(taskElement.finishBefore["#text"]);
//             if (parsedDate) task.finishBefore = parsedDate;
//         }
  
//         // Parse required teams
//         task.requiredTeams = [];
//         if (taskElement.requiredTeams && taskElement.requiredTeams.team) {
//             if (Array.isArray(taskElement.requiredTeams.team)) {
//                 task.requiredTeams = taskElement.requiredTeams.team.map((team: any) => team["#text"]);
//             } else {
//                 task.requiredTeams = [taskElement.requiredTeams.team["#text"]];
//             }
//         }

//         // Parse required agents
//         task.requiredAgents = [];
//         if (taskElement.requiredAgents && taskElement.requiredAgents.agent) {
//             if (Array.isArray(taskElement.requiredAgents.agent)) {
//                 task.requiredAgents = taskElement.requiredAgents.agent.map((agent: any) => agent["#text"]);
//             } else {
//                 task.requiredAgents = [taskElement.requiredAgents.agent["#text"]];
//             }
//         }
  
//         // Parse nested tasks
//         if (taskElement.tasks && taskElement.tasks.task) {
//             //task.subtasks = JSON.stringify(taskElement.tasks);
//             if (Array.isArray(taskElement.tasks.task)) {
//                 task.tasks = taskElement.tasks.task.map((childElement: any, childIndex: number) =>
//                     parseTask(childElement, task.taskId, childIndex)
//                 );
//             } else {
//                 task.tasks = [parseTask(taskElement.tasks.task, task.taskId, 0)];
//             }
//         }
  
//         return task;
//     };

//     const tasks = xmlDoc.tasks && xmlDoc.tasks.task
//       ? Array.isArray(xmlDoc.tasks.task)
//         ? xmlDoc.tasks.task.map((element: any, index: number) => parseTask(element, '', index))
//         : [parseTask(xmlDoc.tasks.task, '', 0)]
//       : [];

//     return tasks;
// }

// function flattenTasks(tasks: any[], depth:number): any[] {
//     return tasks.reduce((acc: any[], task: any) => {
//         acc.push(task);
//         if (task.tasks) {
//             // recursively flatten subtasks only up to the specified depth
//             if (depth-1 >=0 ){
//                 acc.push(...flattenTasks(task.tasks, depth-1));
//             }
//             else { // otherwise, keep the subtasks as a xml string
//                 task.subtasks = xmlTasks(task.tasks);
//             }
//             delete task.tasks;  // then we can remove the 'tasks' property to avoid redundancy
//         }
//         return acc;
//     }, []);
// }

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
                parentTaskId: task.parentTaskId || undefined,
                depth: task.depth,
                nthChild: task.nthChild,
                status: task.status,
                keyTakeaways: task.keyTakeaways || undefined,
                startTime: task.startTime || undefined,
                finishBefore: task.finishBefore || undefined,
                requiredTeams: task.requiredTeams,
                requiredAgents: task.requiredAgents
            });
        }
    },
  });


/*
Example 2:
    <generatedTasks>
    [
    {
        "taskId": "0",
        "description": "Develop a new risk assessment model for high-yield investments",
        "status": "inProgress",
        "startTime": 1683024000,
        "finishBefore": 1688169600,
        "requiredTeams": ["investment team", "risk management"],
        "requiredAgents": ["Kichi", "Dozen"],
        "subtasks": [
        {
            "taskId": "0.1",
            "description": "Research current market trends in high-yield investments",
            "parentTaskId": "0",
            "status": "completed",
            "keyTakeaways": "Identified three emerging markets with potential for high yields: renewable energy, AI-driven healthcare, and sustainable agriculture.",
            "startTime": 1683024000,
            "finishBefore": 1684233600,
            "requiredTeams": ["investment team"]
        },
        {
            "taskId": "0.2",
            "description": "Analyze historical data of similar investment models",
            "parentTaskId": "0",
            "status": "inProgress",
            "startTime": 1684320000,
            "finishBefore": 1685529600,
            "requiredTeams": ["risk management"],
            "requiredAgents": ["Dozen"]
        },
        {
            "taskId": "0.3",
            "description": "Develop algorithm for new risk assessment model",
            "parentTaskId": "0",
            "status": "TODO",
            "startTime": 1685616000,
            "finishBefore": 1687430400,
            "requiredTeams": ["investment team", "risk management"],
            "requiredAgents": ["Kichi"]
        }
        ]
    },
    {
        "taskId": "1",
        "description": "Organize quarterly investor meeting",
        "status": "TODO",
        "startTime": 1686009600,
        "finishBefore": 1687824000,
        "requiredTeams": ["investor relations", "senior management"]
    }
    ]
    </generatedTasks>

    Example 3:
    <generatedTasks>
    [
    {
        "taskId": "0",
        "description": "Implement new ESG (Environmental, Social, and Governance) criteria in investment strategy",
        "status": "inProgress",
        "startTime": 1682419200,
        "finishBefore": 1690156800,
        "requiredTeams": ["investment team", "legal team", "research team"],
        "requiredAgents": ["Lucky", "Malbec"],
        "subtasks": [
        {
            "taskId": "0.1",
            "description": "Review current ESG standards in the industry",
            "parentTaskId": "0",
            "status": "completed",
            "keyTakeaways": "Identified SASB and GRI as key frameworks to incorporate. Need to focus on climate risk, board diversity, and supply chain management.",
            "startTime": 1682419200,
            "finishBefore": 1684233600,
            "requiredTeams": ["research team"],
            "requiredAgents": ["Lucky"]
        },
        {
            "taskId": "0.2",
            "description": "Draft new ESG policy for Nard AI",
            "parentTaskId": "0",
            "status": "inProgress",
            "startTime": 1684320000,
            "finishBefore": 1686744000,
            "requiredTeams": ["investment team", "legal team"],
            "requiredAgents": ["Malbec"]
        },
        {
            "taskId": "0.3",
            "description": "Develop ESG scoring system for potential investments",
            "parentTaskId": "0",
            "status": "TODO",
            "startTime": 1686830400,
            "finishBefore": 1689508800,
            "requiredTeams": ["investment team", "research team"]
        }
        ]
    },
    {
        "taskId": "1",
        "description": "Expand client base in Asia-Pacific region",
        "status": "TODO",
        "startTime": 1683628800,
        "finishBefore": 1699142400,
        "requiredTeams": ["sales team", "marketing team"],
        "subtasks": [
        {
            "taskId": "1.1",
            "description": "Conduct market research on potential clients in APAC",
            "parentTaskId": "1",
            "status": "inProgress",
            "startTime": 1683628800,
            "finishBefore": 1686744000,
            "requiredTeams": ["research team", "sales team"]
        },
        {
            "taskId": "1.2",
            "description": "Develop targeted marketing materials for APAC market",
            "parentTaskId": "1",
            "status": "TODO",
            "startTime": 1686830400,
            "finishBefore": 1689508800,
            "requiredTeams": ["marketing team"]
        }
        ]
    }
    ]
    </generatedTasks>

    Example 4:
    <generatedTasks>
    [
    {
        "taskId": "0",
        "description": "Launch a new AI-driven hedge fund product",
        "status": "TODO",
        "startTime": 1685030400,
        "finishBefore": 1701043200,
        "requiredTeams": ["investment team", "IT team", "legal team", "marketing team"],
        "requiredAgents": ["Vijay", "Kichi"],
        "subtasks": [
        {
            "taskId": "0.1",
            "description": "Develop AI algorithms for market prediction",
            "parentTaskId": "0",
            "status": "inProgress",
            "startTime": 1685030400,
            "finishBefore": 1690243200,
            "requiredTeams": ["investment team", "IT team"],
            "requiredAgents": ["Kichi"]
        },
        {
            "taskId": "0.2",
            "description": "Conduct backtesting of AI algorithms",
            "parentTaskId": "0",
            "status": "TODO",
            "startTime": 1690329600,
            "finishBefore": 1692921600,
            "requiredTeams": ["investment team", "risk management"]
        },
        {
            "taskId": "0.3",
            "description": "Prepare legal documentation for the new fund",
            "parentTaskId": "0",
            "status": "TODO",
            "startTime": 1693008000,
            "finishBefore": 1695600000,
            "requiredTeams": ["legal team"]
        },
        {
            "taskId": "0.4",
            "description": "Develop marketing strategy for the AI-driven fund",
            "parentTaskId": "0",
            "status": "TODO",
            "startTime": 1695686400,
            "finishBefore": 1698278400,
            "requiredTeams": ["marketing team"],
            "requiredAgents": ["Vijay"]
        }
        ]
    },
    {
        "taskId": "1",
        "description": "Implement enhanced cybersecurity measures",
        "status": "inProgress",
        "startTime": 1684425600,
        "finishBefore": 1692921600,
        "requiredTeams": ["IT team", "risk management"],
        "subtasks": [
        {
            "taskId": "1.1",
            "description": "Conduct comprehensive security audit",
            "parentTaskId": "1",
            "status": "completed",
            "keyTakeaways": "Identified vulnerabilities in our cloud infrastructure and client data handling processes. Need to prioritize encryption and access control improvements.",
            "startTime": 1684425600,
            "finishBefore": 1686844800,
            "requiredTeams": ["IT team"]
        },
        {
            "taskId": "1.2",
            "description": "Implement multi-factor authentication across all systems",
            "parentTaskId": "1",
            "status": "inProgress",
            "startTime": 1686931200,
            "finishBefore": 1689523200,
            "requiredTeams": ["IT team"]
        },
        {
            "taskId": "1.3",
            "description": "Conduct employee training on cybersecurity best practices",
            "parentTaskId": "1",
            "status": "TODO",
            "startTime": 1689609600,
            "finishBefore": 1692201600,
            "requiredTeams": ["IT team", "human resources"]
        }
        ]
    }
    ]
    </generatedTasks>

*/


