import { notFound } from "next/navigation";
import { LegalDocumentPage, legalDocuments } from "../legal-documents";
export function generateStaticParams() { return Object.keys(legalDocuments).map((slug) => ({ slug })); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; if (!legalDocuments[slug]) notFound(); return <LegalDocumentPage slug={slug} />; }
