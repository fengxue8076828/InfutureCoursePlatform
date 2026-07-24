import { InstitutionProfilePage } from "@/components/InstitutionsPage";

export default async function InstitutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <InstitutionProfilePage slug={slug} />;
}
