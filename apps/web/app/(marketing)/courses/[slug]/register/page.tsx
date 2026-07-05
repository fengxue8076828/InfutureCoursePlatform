import { notFound } from "next/navigation";

import { CourseSubscribeForm } from "@/components/CourseSubscribeForm";
import { getCourse } from "@/lib/api";

export default async function CourseRegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course) {
    notFound();
  }

  return (
    <main className="bg-mist py-10">
      <CourseSubscribeForm course={course} />
    </main>
  );
}
