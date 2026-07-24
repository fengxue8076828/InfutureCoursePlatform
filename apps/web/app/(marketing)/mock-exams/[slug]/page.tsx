import { ExamPaperDetailPage } from "@/components/ExamPaperPages";

export default async function MockExamDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExamPaperDetailPage kind="mock_exam" slug={slug} />;
}
