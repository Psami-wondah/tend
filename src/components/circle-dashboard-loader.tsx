"use client";

import dynamic from "next/dynamic";

// AG Studio draws on the canvas in the browser, so it never renders on the server.
export const CircleDashboardLoader = dynamic(() => import("./circle-dashboard").then((m) => m.CircleDashboard), {
  ssr: false,
  loading: () => <div className="skeleton h-[70vh] w-full rounded-2xl" aria-label="Loading the dashboard" />,
});
