"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser, isAuthenticated } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export default function AdminHomePage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    const user = getUser();
    if (!user || user.role !== "HR_Admin") {
      router.push("/chat");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">HR Admin Console</h1>
          <p className="text-muted-foreground">
            Manage users and roles for your organization.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/admin/users">
            <Button className="w-full sm:w-auto">Manage Users</Button>
          </Link>
          <Link href="/chat">
            <Button variant="outline" className="w-full sm:w-auto">
              Back to Assistant
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}



