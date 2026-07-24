"use client";

import { ArrowRight, UserRoundCheck, Users } from "lucide-react";
import Link from "next/link";
import type { StudentProfileSummary } from "@/lib/types";

function initials(name?: string | null) {
  return (name || "S")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "S";
}

function Avatar({ student }: { student: StudentProfileSummary }) {
  return student.avatar_url ? (
    <img src={student.avatar_url} alt={student.full_name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-black text-slate-500">
      {initials(student.full_name)}
    </div>
  );
}

function StudentRow({ student }: { student: StudentProfileSummary }) {
  return (
    <Link href={`/leaderboard/${student.id}`} className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-mint/50 hover:shadow-sm">
      <Avatar student={student} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-ink group-hover:text-mint">{student.full_name}</p>
        <p className="truncate text-xs font-semibold text-slate-500">{student.region || "地区未填写"}</p>
      </div>
      <ArrowRight size={14} className="text-slate-300 transition group-hover:text-mint" />
    </Link>
  );
}

function StudentList({ title, students, emptyText }: { title: string; students: StudentProfileSummary[]; emptyText: string }) {
  return (
    <div>
      <h3 className="text-sm font-black text-ink">{title}</h3>
      {students.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-3 grid gap-2">{students.slice(0, 8).map((student) => <StudentRow key={student.id} student={student} />)}</div>
      )}
    </div>
  );
}

export function StudentFollowNetworkPanel({
  followingStudents,
  followerStudents,
  followingCount,
  followersCount
}: {
  followingStudents: StudentProfileSummary[];
  followerStudents: StudentProfileSummary[];
  followingCount: number;
  followersCount: number;
}) {
  return (
    <aside className="grid content-start gap-6">
      <section className="panel rounded-lg p-5">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-coral" />
          <h2 className="text-lg font-black text-ink">关注关系</h2>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-mint/10 p-4">
            <p className="text-xs font-black text-mint">我的关注</p>
            <p className="mt-1 text-2xl font-black text-ink">{followingCount}</p>
          </div>
          <div className="rounded-lg bg-coral/10 p-4">
            <p className="text-xs font-black text-coral">关注我的</p>
            <p className="mt-1 text-2xl font-black text-ink">{followersCount}</p>
          </div>
        </div>
      </section>

      <section className="panel rounded-lg p-5">
        <div className="mb-5 flex items-center gap-2">
          <UserRoundCheck size={18} className="text-coral" />
          <h2 className="text-lg font-black text-ink">学习伙伴</h2>
        </div>
        <div className="grid gap-5">
          <StudentList title="我的关注" students={followingStudents} emptyText="暂时还没有关注其他同学。" />
          <StudentList title="关注我的" students={followerStudents} emptyText="暂时还没有同学关注。" />
        </div>
      </section>
    </aside>
  );
}
