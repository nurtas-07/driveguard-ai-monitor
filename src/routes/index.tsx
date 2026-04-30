import { createFileRoute } from "@tanstack/react-router";
import DriveGuard from "@/components/DriveGuard";

export const Route = createFileRoute("/")({
  component: DriveGuard,
  head: () => ({
    meta: [
      { title: "DriveGuard AI — Fleet Fatigue Monitoring" },
      { name: "description", content: "Real-time driver fatigue detection for fleet managers. AI-powered monitoring via device camera." },
    ],
  }),
});
