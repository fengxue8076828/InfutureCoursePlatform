import { ArrowRight, Euro, Star, Users } from "lucide-react";
import Link from "next/link";

import type { Course } from "@/lib/types";

export function CourseCard({ course, className = "w-[20rem]" }: { course: Course; className?: string }) {
  const heroImageUrl = course.hero_image_url?.trim();

  return (
    <Link
      href={`/courses/${course.slug}`}
      className={`panel block overflow-hidden rounded-lg transition hover:-translate-y-1 hover:border-mint ${className}`}
    >
      {heroImageUrl ? (
        <img src={heroImageUrl} alt={course.title} className="h-40 w-full object-cover" />
      ) : (
        <div className="grid h-40 w-full place-items-center bg-slate-100 text-sm font-semibold text-slate-500">
          尚未上传图片
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-mint/12 px-2.5 py-1 text-mint">{course.category}</span>
          <span>{course.level}</span>
        </div>
        <h3 className="mt-3 text-lg font-bold leading-snug text-ink">{course.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{course.subtitle}</p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <Euro size={15} /> {course.price_eur_monthly.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}/月
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={15} /> {course.students_count}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-sm font-bold text-amber-600">
          <Star size={15} fill="currentColor" />
          <span>{(course.rating_average ?? 0).toFixed(1)}</span>
          <span className="font-semibold text-slate-400">({course.rating_count ?? 0})</span>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm font-semibold text-coral">
          <span>{course.institution.name}</span>
          <ArrowRight size={16} />
        </div>
      </div>
    </Link>
  );
}
