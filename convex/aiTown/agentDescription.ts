import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  teamType: string;
  plan: string;

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, teamType} = serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.teamType = teamType;
    this.plan = plan;
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, teamType } = this;
    return { agentId, identity, plan, teamType };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  teamType: v.string(),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
