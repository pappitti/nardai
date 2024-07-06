import { ObjectType, v } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { agentId, teamId, parseGameId, GameId } from '../aiTown/ids';
import { SerializedTeam } from '../aiTown/team';
import { SerializedAgentDescription } from '../aiTown/agentDescription';
import { defineTable } from 'convex/server';
import { LLM_CONFIG } from '../util/llm';
import { LLMMessage, chatCompletion } from '../util/llm';


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
        this.parentTaskId = parentTaskId && parentTaskId;
        this.nthChild = nthChild;
        this.status = status;
        this.keyTakeaways = keyTakeaways;
        this.startTime = startTime;
        this.finishBefore = finishBefore;
        this.requiredTeams = serialized.requiredTeams ? serialized.requiredTeams.map((id:string) => parseGameId('teams', id)) : undefined;
        this.requiredAgents = serialized.requiredAgents ? serialized.requiredAgents.map((id:string) => parseGameId('agents', id)) : undefined;
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

// method : find parents upto the root and use text to pass to llm, query llm, update status

export async function generateTasks(
    ctx: ActionCtx,
    worldId: Id<'worlds'>,
    planId: Id<'plans'>,
    teams : SerializedTeam[], 
    playerName : string, 
    agentDescription : SerializedAgentDescription,
    xmlPlan?: string, 
    level: number = 0
  ) {

    //USE Promise.all to get all the tasks of the agent

    const teamDescription = teams.find((t) => t.name === agentDescription?.teamType);
    
    const systemPrompt : LLMMessage = {
        role: 'system',
        // TODO : Other teams include: IT team, HR team, Finance team, Marketing team, Sales team, Customer Service team, Operations team, Legal team, R&D team, and Executive team.
        content: `You work in an Asset Management firm called "Nard AI" where you are part of the ${agentDescription?.teamType}. Your name is ${playerName}.\n Here is a brief about what your team's duties and objectives: ${teamDescription}\n As part of your duties the ${agentDescription?.teamType}, you make plans and you take actions but you also have your own agenda : ${agentDescription?.plan}. \n To structure your plan, you use the XML syntax which allows to nest subtasks within tasks.\n When generating an XML representation of tasks, please follow these guidelines:\n 1 - Each task should be enclosed in a <task> tag.\n 2 - apart from id and depth, attributes should be included as separate child elements within the <task> tag.\n 3 - some elements may be optional, only include optional elements if they have a value.\n
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
      
      The list of teams in the company  are : ${teams.map((t) => t.name).join(', ') /*TODO*/}
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

    if (!xmlPlan) {
        prompt.push(`You have not started to establish a plan yet. At first, you need to need to define up to 5 key tasks consistent with your professional duties and your personal objectives. Each of these tasks must be enclosed in a <task> tag, do not include subtasks at this stage, we will iterate based on the initial choice.`);
    }
    else {
        prompt.push(`You have already started to establish the following list of tasks taking into account your professional duties and your personal objectives : ${xmlPlan}`);
        prompt.push(`You need to add subtasks for eact tasks of depth ${level-1}. You can only add a maximum of ${5-level} subtasks for each task of depth ${level-1}. Do not change existing tasks. You can only add new subtasks. All subtasks of a parent task mus be enclosed in a<tasks> tag`);
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

function parseXMLTasks(xml: string) {
    // parse the xml and return the tasks
}

// export const listMessages = query({
//     args: {
//       worldId: v.id('worlds'),
//       conversationId,
//     },
//     handler: async (ctx, args) => {
//       const messages = await ctx.db
//         .query('messages')
//         .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', args.conversationId))
//         .collect();
//       const out = [];
//       for (const message of messages) {
//         const playerDescription = await ctx.db
//           .query('playerDescriptions')
//           .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
//           .first();
//         if (!playerDescription) {
//           throw new Error(`Invalid author ID: ${message.author}`);
//         }
//         out.push({ ...message, authorName: playerDescription.name });
//       }
//       return out;
//     },
//   });
  
//   export const writeMessage = mutation({
//     args: {
//       worldId: v.id('worlds'),
//       conversationId,
//       messageUuid: v.string(),
//       playerId,
//       text: v.string(),
//     },
//     handler: async (ctx, args) => {
//       await ctx.db.insert('messages', {
//         conversationId: args.conversationId,
//         author: args.playerId,
//         messageUuid: args.messageUuid,
//         text: args.text,
//         worldId: args.worldId,
//       });
//       await insertInput(ctx, args.worldId, 'finishSendingMessage', {
//         conversationId: args.conversationId,
//         playerId: args.playerId,
//         timestamp: Date.now(),
//       });
//     },
//   });




