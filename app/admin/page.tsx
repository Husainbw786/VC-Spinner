import type { Metadata } from "next";
import Admin from "@/components/Admin";

export const metadata: Metadata = {
  title: "Admin · Committee Draw",
  robots: { index: false },
};

export default function Page() {
  return <Admin />;
}
