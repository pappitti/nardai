import { ObjectType, v } from 'convex/values';
import { GameId, parseGameId, teamId } from './ids';
import { Point, point} from '../util/types';
import { inputHandler } from './inputHandler';
import { Teams } from '../../data/teams';
import { internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';

const selfInternal = internal.aiTown.team // not used at this stage (matbe later to use the findmembers function)

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