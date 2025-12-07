"use client";

import { useDraftModeEnvironment } from "next-sanity/hooks";
import { useRouter } from "next/navigation";

export function DisableDraftMode() {
    const environment = useDraftModeEnvironment();
    const router = useRouter();

    if (environment !== "live" && environment !== "unknown") {
        return null;
}

const handleClick = async () => {
    await fetch("/draft-mode/disable");
    router.refresh();
};

return (
    <button
    onClick={handleClick}
    className="fixed bottom-4 right-4 z-50 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full p-2 text-sm text-gray-500 hover:text-gray-700"
    >
        Disable draft mode
    </button>
)

}