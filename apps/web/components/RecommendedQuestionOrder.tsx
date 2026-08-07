"use client";

import { Children, type ReactNode, useMemo } from "react";

import { useRecommendationFeed } from "@/lib/recommendations";

export function RecommendedQuestionOrder({
  questionIds,
  children
}: {
  questionIds: number[];
  children: ReactNode;
}) {
  const feed = useRecommendationFeed();
  const childrenArray = Children.toArray(children);

  const orderedChildren = useMemo(() => {
    const order = feed?.orders.questions;
    if (!order?.length || childrenArray.length < 2) return childrenArray;

    const positions = new Map(order.map((id, index) => [Number(id), index]));
    return childrenArray
      .map((child, index) => ({ child, id: questionIds[index], index }))
      .sort((left, right) => {
        const leftPosition = positions.get(Number(left.id));
        const rightPosition = positions.get(Number(right.id));
        if (leftPosition === undefined && rightPosition === undefined) return left.index - right.index;
        if (leftPosition === undefined) return 1;
        if (rightPosition === undefined) return -1;
        return leftPosition - rightPosition;
      })
      .map(({ child }) => child);
  }, [childrenArray, feed?.orders.questions, questionIds]);

  return <>{orderedChildren}</>;
}