import { MapPin } from "lucide-react";
import Link from "next/link";

import type { Teacher } from "@/lib/types";

export function TeacherCard({ teacher }: { teacher: Teacher }) {
  const specialty =
    Array.isArray(teacher.specialties?.items) && teacher.specialties.items.length > 0
      ? teacher.specialties.items[0]
      : teacher.title;
  const avatarUrl = teacher.avatar_url?.trim();
  const teacherHref = `/teachers/${teacher.slug?.trim() || teacher.id}`;

  return (
    <Link
      href={teacherHref}
      className="panel block w-[17rem] rounded-lg p-4 transition hover:-translate-y-1 hover:border-coral"
    >
      <div className="flex items-center gap-3">
        <img
          src={avatarUrl || "/avatars/default-teacher.svg"}
          alt={avatarUrl ? teacher.name : "默认老师头像"}
          className="h-16 w-16 rounded-lg object-cover"
        />
        <div>
          <h3 className="font-bold text-ink">{teacher.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{teacher.title}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{teacher.bio}</p>
      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1">
          <MapPin size={14} /> {teacher.region}
        </span>
        <span>{specialty}</span>
      </div>
    </Link>
  );
}
