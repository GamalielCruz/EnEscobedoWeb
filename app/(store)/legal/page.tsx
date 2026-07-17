import Link from "next/link";
import { legalDocuments } from "./legal-documents";
import { legalConfig } from "@/lib/legal-config";
export default function Page() { return <main className="mx-auto min-h-screen max-w-5xl px-4 py-10"><h1 className="text-3xl font-bold">Centro legal de ElMenu</h1><p className="mt-3 text-gray-600">Documentos vigentes. Versión {legalConfig.version}.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{Object.entries(legalDocuments).map(([slug, d]) => <Link key={slug} href={`/legal/${slug}`} className="rounded-xl border bg-white p-5 hover:border-[#eb1902]"><h2 className="font-semibold">{d.title}</h2><p className="mt-2 text-sm text-gray-600">{d.summary}</p></Link>)}</div></main>; }
