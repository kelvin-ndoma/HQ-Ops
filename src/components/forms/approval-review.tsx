"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewApprovalAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function ApprovalReview({ id }: { id: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="mt-2 flex flex-wrap gap-2" onSubmit={async (event) => {
      event.preventDefault();
      const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "rejected" ? "rejected" : "approved";
      const result = await reviewApprovalAction(id, decision, notes);
      if (!result.ok) setError(result.error);
      else router.refresh();
    }}>
      <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Reviewer note" />
      <Button type="submit" value="approved" size="sm">Approve</Button>
      <Button type="submit" value="rejected" size="sm" variant="secondary">Reject</Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
