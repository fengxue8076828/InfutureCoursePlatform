import { StudentCourseRoomPage } from "@/components/StudentCourseRoomPage";

export default async function StudentCourseRoomRoute({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StudentCourseRoomPage courseSlug={slug} />;
}
