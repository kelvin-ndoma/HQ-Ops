"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ENQUIRY_EXITS, ENQUIRY_STAGES, ENQUIRY_STATUS_LABELS, type EnquiryStatus } from "@/domain/states";
import { addNoteAction, transitionEnquiryAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";

export function EnquiryControls({
  id,
  stage,
  lostReasons,
}: {
  id: string;
  stage: EnquiryStatus;
  lostReasons: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [next, setNext] = useState(stage);
  const [reason, setReason] = useState(lostReasons[0]?.id || "");
  const [note, setNote] = useState("");

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await transitionEnquiryAction({
            id,
            stage: next,
            lostReasonId: next === "lost" ? reason : "",
            lostNotes: note,
          });
          if (!result.ok) setError(result.error);
          else {
            toast.success("Stage updated");
            router.refresh();
          }
        }}
      >
        <Select value={next} onChange={(event) => setNext(event.target.value as EnquiryStatus)}>
          {[...ENQUIRY_STAGES, ...ENQUIRY_EXITS].map((value) => <option key={value} value={value}>{ENQUIRY_STATUS_LABELS[value]}</option>)}
        </Select>
        {next === "lost" ? (
          <Select value={reason} onChange={(event) => setReason(event.target.value)}>
            {lostReasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        ) : null}
        <Button type="submit">Move stage</Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await addNoteAction({ entityType: "enquiry", entityId: id, body: note });
          if (!result.ok) setError(result.error);
          else {
            setNote("");
            toast.success("Note added");
            router.refresh();
          }
        }}
      >
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was said, and what happens next?" />
        <Button type="submit" variant="secondary">Add note</Button>
      </form>
    </div>
  );
}
