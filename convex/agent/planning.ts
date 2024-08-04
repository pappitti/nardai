import {SerializedTask} from '../aiTown/task';

export function jsonTasks(tasks: SerializedTask [], parent? : string): string {
    if (!tasks || tasks.length===0) return '';

    const rootTasks: SerializedTask [] = parent 
        ? tasks.filter(t => t.parentTaskId===parent)
        : tasks.filter(t => !t.parentTaskId);

    const result = rootTasks.map(task => {
        // Find children of the current task
        const childTasks = tasks.filter(t =>t.taskId.startsWith(task.taskId + '.'));
    
        // Recursively process subtasks
        const subtasks = childTasks.length>0 ? jsonTasks(childTasks, task.taskId): '[]';
    
        return {
            ...task,
            subtasks: subtasks !== '[]' ? JSON.parse(subtasks) : undefined
        };
        });

    console.log('planning: jsonTasks', result);
    return JSON.stringify(result, null, 2);
}

// export function xmlTasks(tasks: (SerializedTask & { subtasks?: string })[]): string {
//     if (!tasks || tasks.length===0) return '';

//     // Helper function to escape special XML characters
//     function escapeXml(unsafe: string): string {
//         return unsafe.replace(/[<>&'"]/g, c => {
//         switch (c) {
//             case '<': return '&lt;';
//             case '>': return '&gt;';
//             case '&': return '&amp;';
//             case "'": return '&apos;';
//             case '"': return '&quot;';
//             default: return c;
//         }  });
//     }

//     const taskMap = new Map<string, SerializedTask  & { subtasks?: string }>();
//     const rootTasks: (SerializedTask & { subtasks?: string })[] = [];

//     for (const task of tasks) {
//         taskMap.set(task.taskId, task);
//         if (!task.parentTaskId) {
//           rootTasks.push(task);
//         }
//       }

//     // Helper function to recursively build XML for a task and its children
//     const buildTaskXml = (task: (SerializedTask& { subtasks?: string }), indent: string = ''): string => {
//         let xml = `${indent}<task id="${task.taskId}" depth="${task.depth}">\n`;
//         xml += `${indent}  <description>${escapeXml(task.description)}</description>\n`;
//         xml += `${indent}  <status>${task.status}</status>\n`;
//         if (task.keyTakeaways) {
//             xml += `${indent}  <keyTakeaways>${escapeXml(task.keyTakeaways)}</keyTakeaways>\n`;
//         }
//         if (task.startTime) {
//             xml += `${indent}  <startTime>${task.startTime}</startTime>\n`;
//         }
//         if (task.finishBefore) {
//             xml += `${indent}  <finishBefore>${task.finishBefore}</finishBefore>\n`;
//         }
//         if (task.requiredTeams) {
//             xml += `${indent}  <requiredTeams>\n`;
//             for (const team of task.requiredTeams) {
//                 xml += `${indent}    <team>${team}</team>\n`;
//             }
//             xml += `${indent}  </requiredTeams>\n`;
//         }
//         if (task.requiredAgents) {
//             xml += `${indent}  <requiredAgents>\n`;
//             for (const agent of task.requiredAgents) {
//                 xml += `${indent}    <agent>${agent}</agent>\n`;
//             }
//             xml += `${indent}  </requiredAgents>\n`;
//         }
        
//         // Find and process child tasks
//         const childTasks = tasks.filter(t => t.parentTaskId === task.taskId);
//         if (childTasks.length !== 0) {
//             xml += `${indent}  <tasks>\n`;
//             for (const childTask of childTasks) {
//                 xml += buildTaskXml(childTask, indent);
//             }
//             xml += `${indent}  </tasks>\n`;
//         }
//         else if (task.subtasks) {
//             //xml += `${indent}  <tasks>\n`;
//             xml += `${indent}    ${task.subtasks}`;
//             //xml += `${indent}  </tasks>\n`;

//         }
        
//         xml += `${indent}</task>\n`;
//         return xml;
//     }

//      // Build the final XML
//     let xmlTree = '<tasks>\n';
//     for (const rootTask of rootTasks) {
//         xmlTree += buildTaskXml(rootTask, '  ');
//     }
//     xmlTree += '</tasks>';

//     console.log('planning : xmltasks',xmlTree);

//     return xmlTree;
// }