/**
 * lib/server/progress.ts — Reward definitions + progress computation
 */

export interface RewardDef {
  id: string;
  eventType: string;
  target: number;
  tokens: number;
  title: string;
  description: string;
  isDistinct?: boolean;
  isDaily?: boolean;
}

export const REWARDS: RewardDef[] = [
  { id: 'publish_first_game', eventType: 'publish', target: 1, tokens: 1, title: 'First Published Game', description: 'Publish your first game to the Explorer' },
  { id: 'publish_3_games', eventType: 'publish', target: 3, tokens: 1, title: 'Prolific Developer', description: 'Publish 3 different games', isDistinct: true },
  { id: 'publish_5_games', eventType: 'publish', target: 5, tokens: 1, title: 'Game Studio', description: 'Publish 5 different games', isDistinct: true },
  { id: 'play_2_games', eventType: 'play', target: 2, tokens: 1, title: 'Curious Explorer', description: 'Play 2 different games in Explorer', isDistinct: true },
  { id: 'play_5_games', eventType: 'play', target: 5, tokens: 1, title: 'Game Enthusiast', description: 'Play 5 different games in Explorer', isDistinct: true },
  { id: 'play_10_games', eventType: 'play', target: 10, tokens: 1, title: 'Game Connoisseur', description: 'Play 10 different games in Explorer', isDistinct: true },
  { id: 'install_first_game', eventType: 'install', target: 1, tokens: 1, title: 'First Install', description: 'Install your first game from Explorer', isDistinct: true },
  { id: 'comment_first', eventType: 'comment', target: 1, tokens: 1, title: 'First Comment', description: 'Post your first comment on a game' },
  { id: 'vote_first', eventType: 'vote', target: 1, tokens: 1, title: 'First Vote', description: 'Cast your first vote on a game' },
  { id: 'daily_login', eventType: 'login', target: 1, tokens: 1, title: 'Daily Login', description: 'Log in today', isDaily: true },
];

import { prisma } from './db';

export async function computeProgress(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    REWARDS.map(async (reward) => {
      let current: number;
      if (reward.isDaily) {
        current = await prisma.progressEvent.count({
          where: { userId, eventType: reward.eventType, createdAt: { gte: today } },
        });
      } else if (reward.isDistinct) {
        const events = await prisma.progressEvent.findMany({
          where: { userId, eventType: reward.eventType, refId: { not: null } },
          select: { refId: true },
        });
        current = new Set(events.map(e => e.refId)).size;
      } else {
        current = await prisma.progressEvent.count({
          where: { userId, eventType: reward.eventType },
        });
      }

      const completed = current >= reward.target;
      const claimed = await prisma.claimedReward.findUnique({
        where: { userId_rewardId: { userId, rewardId: reward.id } },
      });

      return {
        ...reward,
        current: Math.min(current, reward.target),
        target: reward.target,
        completed,
        claimed: !!claimed,
        claimable: completed && !claimed,
      };
    })
  );

  return results;
}

export async function hasClaimableGifts(userId: string): Promise<boolean> {
  const progress = await computeProgress(userId);
  return progress.some((p) => p.claimable);
}
