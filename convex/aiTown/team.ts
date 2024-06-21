import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId, teamId } from './ids';
import { Point, point} from '../util/types';
import { inputHandler } from './inputHandler';
import { Teams, TeamName } from '../../data/teams';
import { serializedPlayer } from './player';
import { Game } from './game';
import {
  ACTION_TIMEOUT,
  AWKWARD_CONVERSATION_TIMEOUT,
  CONVERSATION_COOLDOWN,
  CONVERSATION_DISTANCE,
  INVITE_ACCEPT_PROBABILITY,
  INVITE_TIMEOUT,
  MAX_CONVERSATION_DURATION,
  MAX_CONVERSATION_MESSAGES,
  MESSAGE_COOLDOWN,
  MIDPOINT_THRESHOLD,
  PLAYER_CONVERSATION_COOLDOWN,
} from '../constants';
import { FunctionArgs } from 'convex/server';
import { ActionCtx, DatabaseReader, internalMutation, internalQuery } from '../_generated/server';
import { distance } from '../util/geometry';
import { internal } from '../_generated/api';
import { movePlayer } from './movement';
import { insertInput } from './insertInput';
import { AgentDescription } from './agentDescription';

// method findMembers
//const selfInternal = internal.aiTown.team

export class Team {
    id: GameId<'teams'>;
    name: string;
    description: string;
    hq: Point;

    constructor(serialized: SerializedTeam) {
        const { id, name, hq, description } = serialized;
        this.id = parseGameId('teams', id);
        this.name = name;
        this.hq = hq;
        this.description= description;
    };

    serialize(): SerializedTeam {
        return {
            id: this.id,
            name: this.name,
            hq: this.hq,
            description: this.description,  
        };
    };

}

export const serializedTeam = {
id: teamId,
name: v.string(),
description : v.string(),
hq: point,
};

export type SerializedTeam = ObjectType<typeof serializedTeam>;

export const teamInputs = {
    createTeam: inputHandler({
      args: {
        teamIndex: v.number(),
      },
      handler: (game, now, args) => {
        const team = Teams[args.teamIndex];
        const teamId = game.allocId('teams');
        game.world.teams.set(
          teamId,
          new Team({
            id: teamId,
            name: team.name,
            description: team.description,
            hq: team.hq,
          }),
        );
        return { teamId };
      },
    }),
  }

export const findMembers = internalQuery({
    args: {
        worldId: v.id('worlds'),
        teamType: v.string(),
    },
    handler: async (ctx, args) => {
        const teamMembers = await ctx.db
            .query('agentDescriptions')
            .withIndex('team', (q) => q.eq('worldId', args.worldId).eq('teamType', args.teamType))
            .collect();
        return teamMembers;
    },
});