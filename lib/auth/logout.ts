"use client";

import { useRouter } from "next/navigation";
import { clearAuth } from "./client";

export function useLogout() {
  const router = useRouter();

  return () => {
    clearAuth();
    router.push("/login");
  };
}

