"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/lib/api-config";
import {
  getStudentRequestHeaders,
  getStudentSessionUser,
  subscribeToStudentSession,
} from "@/lib/student-session";

export type RecommendationKey =
  | "courses"
  | "learning_paths"
  | "teachers"
  | "activities"
  | "questions"
  | "mock_exams"
  | "competitions"
  | "students"
  | "institutions";

export type RecommendationFeed = {
  personalized: boolean;
  source: string;
  generated_at: string;
  orders: Partial<Record<RecommendationKey, number[]>>;
};

let cachedUserId: number | null = null;
let cachedFeed: RecommendationFeed | null = null;
let cachedPromise: Promise<RecommendationFeed | null> | null = null;

async function loadRecommendationFeed(userId: number): Promise<RecommendationFeed | null> {
  if (cachedUserId === userId && cachedFeed) {
    return cachedFeed;
  }
  if (cachedUserId === userId && cachedPromise) {
    return cachedPromise;
  }

  cachedUserId = userId;
  cachedPromise = fetch(`${API_BASE_URL}/recommendations/feed?ts=${Date.now()}`, {
    headers: getStudentRequestHeaders(),
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as RecommendationFeed;
    })
    .then((feed) => {
      cachedFeed = feed;
      return feed;
    })
    .catch(() => null)
    .finally(() => {
      cachedPromise = null;
    });

  return cachedPromise;
}

export function useRecommendationFeed() {
  const [userId, setUserId] = useState<number | null>(() => getStudentSessionUser()?.id ?? null);
  const [feed, setFeed] = useState<RecommendationFeed | null>(null);

  useEffect(() => {
    return subscribeToStudentSession(() => {
      const nextUserId = getStudentSessionUser()?.id ?? null;
      setUserId(nextUserId);
      if (!nextUserId) {
        cachedUserId = null;
        cachedFeed = null;
        cachedPromise = null;
        setFeed(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      setFeed(null);
      return;
    }
    let cancelled = false;
    loadRecommendationFeed(userId).then((nextFeed) => {
      if (!cancelled) {
        setFeed(nextFeed);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return feed;
}

export function reorderByRecommendation<T>(
  items: T[],
  order: number[] | undefined,
  getId: (item: T) => number | string | null | undefined = (item) => (item as { id?: number | string }).id,
): T[] {
  if (!order?.length || items.length < 2) {
    return items;
  }
  const positions = new Map(order.map((id, index) => [Number(id), index]));
  return [...items].sort((left, right) => {
    const leftPosition = positions.get(Number(getId(left)));
    const rightPosition = positions.get(Number(getId(right)));
    if (leftPosition === undefined && rightPosition === undefined) {
      return 0;
    }
    if (leftPosition === undefined) {
      return 1;
    }
    if (rightPosition === undefined) {
      return -1;
    }
    return leftPosition - rightPosition;
  });
}
