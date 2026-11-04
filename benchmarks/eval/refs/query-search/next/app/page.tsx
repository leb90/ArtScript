import { Suspense } from "react";
import Search from "@/components/Search";

export default function Page() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}
