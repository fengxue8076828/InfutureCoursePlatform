import { CourseExplorer } from "@/components/CourseExplorer";
import { getCourseCategories, getCourses, getInstitutions } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CoursesPage() {
  const [courses, institutions, courseCategories] = await Promise.all([
    getCourses(),
    getInstitutions(),
    getCourseCategories()
  ]);

  return (
    <main className="bg-mist py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CourseExplorer
          courses={courses}
          institutions={institutions}
          courseCategories={courseCategories}
        />
      </div>
    </main>
  );
}
