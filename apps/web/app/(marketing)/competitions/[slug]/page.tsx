import { ExamPaperDetailPage } from "@/components/ExamPaperPages";

export default async function CompetitionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExamPaperDetailPage kind="competition" slug={slug} />;
}
