"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

export function ScrollRow({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function scrollByDirection(direction: "left" | "right") {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = Math.max(320, Math.floor(scroller.clientWidth * 0.75));
    scroller.scrollBy({ left: direction === "left" ? -distance : distance, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scrollByDirection("left")}
        className="focus-ring absolute -left-14 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/95 text-ink shadow-soft transition hover:border-coral hover:text-coral xl:grid"
        aria-label="Scroll left"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        onClick={() => scrollByDirection("right")}
        className="focus-ring absolute -right-14 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/95 text-ink shadow-soft transition hover:border-coral hover:text-coral xl:grid"
        aria-label="Scroll right"
      >
        <ChevronRight size={20} />
      </button>
      <div ref={scrollerRef} className="overflow-x-auto scroll-smooth pb-3 scrollbar-hide">
        <div className="flex w-full gap-4">{children}</div>
      </div>
    </div>
  );
}
