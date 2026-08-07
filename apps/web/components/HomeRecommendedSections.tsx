"use client";

import Link from "next/link";

import { CourseCard } from "@/components/CourseCard";
import { ScrollRow } from "@/components/ScrollRow";
import { TeacherCard } from "@/components/TeacherCard";
import { reorderByRecommendation, useRecommendationFeed } from "@/lib/recommendations";
import type { Course, Institution, Teacher } from "@/lib/types";

function InstitutionLogo({ institution }: { institution: Institution }) {
  const logoUrl = institution.logo_url?.trim();

  return (
    <Link
      href={`/institutions/${institution.slug}`}
      aria-label={`查看${institution.name}机构主页`}
      className="grid h-20 min-w-0 place-items-center rounded-lg px-3 py-2 transition hover:bg-white/70"
    >
      <span className="grid h-16 w-full place-items-center">
        {logoUrl ? (
          <img src={logoUrl} alt={institution.name} className="h-14 w-full object-contain" />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-mint/15 text-xl font-black text-mint">
            {institution.name.slice(0, 1)}
          </span>
        )}
      </span>
    </Link>
  );
}

export function HomeInstitutionLogos({ institutions }: { institutions: Institution[] }) {
  const recommendationFeed = useRecommendationFeed();
  const visibleInstitutions = reorderByRecommendation(institutions, recommendationFeed?.orders.institutions).slice(0, 8);

  return <>{visibleInstitutions.map((institution) => <InstitutionLogo key={institution.id} institution={institution} />)}</>;
}

export function HomeFeaturedCourses({ courses }: { courses: Course[] }) {
  const recommendationFeed = useRecommendationFeed();
  const visibleCourses = reorderByRecommendation(courses, recommendationFeed?.orders.courses);

  return (
    <ScrollRow>
      {visibleCourses.map((course) => (
        <CourseCard key={course.id} course={course} className="w-[calc((100%-3rem)/4)] min-w-[17rem] shrink-0" />
      ))}
    </ScrollRow>
  );
}

export function HomeTeachers({ teachers }: { teachers: Teacher[] }) {
  const recommendationFeed = useRecommendationFeed();
  const visibleTeachers = reorderByRecommendation(teachers, recommendationFeed?.orders.teachers);

  return (
    <ScrollRow>
      {visibleTeachers.map((teacher) => (
        <TeacherCard key={teacher.id} teacher={teacher} />
      ))}
    </ScrollRow>
  );
}