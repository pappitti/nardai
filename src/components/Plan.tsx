import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { SerializedTask } from '../../convex/aiTown/task.ts';

export function Plans({
    worldId, 
    planId,
    planTasks 
}: { 
    worldId:Id<'worlds'>,
    planId: Id<'plans'>,
    planTasks?: SerializedTask[]
}) {
    const [planState, setPlanState] = useState<SerializedTask[]| undefined>(planTasks);
    
    const plan = useQuery(api.aiTown.plan.getPlanTasks, !planTasks 
        ?{ worldId, planId }
        : 'skip'
    );
    
    useEffect(() => {
        if (planTasks) {
            setPlanState(planTasks);
            return;
        };
        setPlanState(plan);
    }, [plan, planTasks]);
    
    return (
        <div className="desc my-6">
            <div className="text-base text-slate-400 sm:text-sm">
              {planState && planState.map((task) => 
                <div key={task.taskId} 
                  style={{ 
                    marginTop: (task.taskId.split('.').length === 1 && task.taskId!='0') ? '1rem' : '0.5rem', 
                    paddingLeft: `${(task.taskId.split('.').length-1) * 10}px` }}
                >
                  <div className="text-slate-600 font-bold">
                    {task.taskId}:{task.description}
                  </div>
                  <div>status : {task.status}</div>
                  <div>required : {[...(task.requiredAgents||[]),...(task.requiredTeams||[])].join(', ')}</div>
                </div>
                )
              }
            </div>
          </div>
    );
}