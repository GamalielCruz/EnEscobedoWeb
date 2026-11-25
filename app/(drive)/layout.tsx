/**
 * Drive layout — rendered INSIDE the root layout.
 *
 * The root layout (app/layout.tsx) provides:
 *   <html>, <body>, ClerkProvider, Analytics, SanityLive, ChatwootWidget
 *
 * This layout only wraps Drive children with the dark background styling.
 * Clerk auth is inherited from the root ClerkProvider.
 */
export default function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#09193B] text-white overscroll-none">
      {children}
    </div>
  );
}
