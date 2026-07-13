import Image from "next/image";

// Served by the service worker when a navigation fails offline (see
// next.config.mjs → fallbacks.document). Must stay static — no auth, no data
// fetching — so it can be precached from the build output.
export const metadata = {
  title: "Offline — Church Directory",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="relative h-16 w-16 overflow-hidden rounded-full bg-white shadow">
        <Image src="/stsa-logo.png" alt="STSA Church" fill sizes="64px" className="object-cover" />
      </div>
      <div>
        <h1 className="font-heading text-2xl font-semibold text-brand-navy">You&rsquo;re offline</h1>
        <p className="mt-2 max-w-sm text-[14.5px] text-[#5B7185]">
          The directory needs a connection to load member information. Reconnect and try again.
        </p>
      </div>
    </div>
  );
}
