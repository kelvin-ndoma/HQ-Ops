"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { quoteStatusAction } from "@/server/actions";
import { Button } from "@/components/ui/button";

export function QuoteActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  async function go(next: "sent" | "viewed" | "accepted" | "declined" | "expired") {
    const result = await quoteStatusAction({ id, status: next });
    if (!result.ok) setError(result.error);
    else router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" ? <Button onClick={() => go("sent")}>Mark sent</Button> : null}
      {status === "sent" ? <Button variant="secondary" onClick={() => go("viewed")}>Mark viewed</Button> : null}
      {status === "sent" || status === "viewed" ? <Button onClick={() => go("accepted")}>Accept</Button> : null}
      {status === "sent" || status === "viewed" ? <Button variant="secondary" onClick={() => go("declined")}>Decline</Button> : null}
      {status === "sent" || status === "viewed" ? <Button variant="outline" onClick={() => go("expired")}>Expire</Button> : null}
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
