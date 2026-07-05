import { BookOpenCheck, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import { CourseCard } from "@/components/CourseCard";
import { getCourses, getTeacher, getTeachers } from "@/lib/api";

export async function generateStaticParams() {
  const teachers = await getTeachers();
  return teachers.map((teacher) => ({ slug: teacher.slug }));
}

export default async function TeacherDetailPage({ params }: { params: { slug: string } }) {
  const [teacher, courses] = await Promise.all([getTeacher(params.slug), getCourses()]);
  if (!teacher) {
    notFound();
  }
  const teacherCourses = courses.filter((course) => course.teacher.slug === teacher.slug);

  return (
    <main className="bg-mist py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="grid gap-8 rounded-lg bg-white p-6 shadow-soft md:grid-cols-[18rem_1fr]">
          <img src={teacher.avatar_url} alt={teacher.name} className="h-72 w-full rounded-lg object-cover" />
          <div className="flex flex-col justify-center">
            <p className="text-sm font-bold text-coral">{teacher.title}</p>
            <h1 className="mt-2 text-4xl font-black text-ink">{teacher.name}</h1>
            <p className="mt-4 max-w-3xl leading-8 text-slate-600">{teacher.bio}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5">
                <MapPin size={15} /> {teacher.region}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-mint/12 px-3 py-1.5 text-mint">
                <BookOpenCheck size={15} /> {teacher.institution?.name}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-ink">TA 的课程</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teacherCourses.map((course) => (
              <div key={course.id} className="[&>a]:w-full">
                <CourseCard course={course} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
