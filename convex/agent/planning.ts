import {SerializedTask} from '../aiTown/task';

export function xmlTasks(tasks: SerializedTask[]): string {
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

    const taskMap = new Map<string, SerializedTask >();
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