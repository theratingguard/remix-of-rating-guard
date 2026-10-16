import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addStaffQualityNote,
  addStaffWalletAdjustment,
  setStaffMonthlyTarget,
} from "@/lib/staff-case.functions";

export function AdminStaffPhaseTwo({
  staffId,
  monthlyTarget,
}: {
  staffId: string;
  monthlyTarget: number;
}) {
  const queryClient = useQueryClient();
  const updateTarget = useServerFn(setStaffMonthlyTarget);
  const createNote = useServerFn(addStaffQualityNote);
  const createAdjustment = useServerFn(addStaffWalletAdjustment);
  const [target, setTarget] = useState(String(monthlyTarget));
  const [noteType, setNoteType] = useState<"warning" | "appreciation">("appreciation");
  const [note, setNote] = useState("");
  const [transactionType, setTransactionType] = useState<"quality_bonus" | "penalty">(
    "quality_bonus",
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    operation: () => Promise<unknown>,
    success: string,
    onSuccess?: () => void,
  ) {
    event.preventDefault();
    setBusy(true);
    try {
      await operation();
      await queryClient.invalidateQueries({ queryKey: ["admin-staff-cases"] });
      onSuccess?.();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save staff settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface space-y-5 p-5">
      <h2 className="font-bold">Performance target and staff notes</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) =>
          void submit(
            event,
            () => updateTarget({ data: { staffId, target: Number(target) } }),
            "Monthly target updated.",
          )
        }
      >
        <div className="space-y-2">
          <Label htmlFor="staff-monthly-target">Monthly task target</Label>
          <Input
            id="staff-monthly-target"
            type="number"
            min="0"
            max="10000"
            step="1"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={busy}>
          Save target
        </Button>
      </form>
      <form
        className="space-y-3 border-t pt-4"
        onSubmit={(event) =>
          void submit(
            event,
            () => createNote({ data: { staffId, noteType, note } }),
            "Staff note added.",
            () => setNote(""),
          )
        }
      >
        <h3 className="font-semibold">Add warning or appreciation note</h3>
        <div className="space-y-2">
          <Label htmlFor="staff-note-type">Note type</Label>
          <select
            id="staff-note-type"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={noteType}
            onChange={(event) => setNoteType(event.target.value as typeof noteType)}
          >
            <option value="appreciation">Appreciation</option>
            <option value="warning">Warning</option>
          </select>
        </div>
        <Textarea
          aria-label="Staff note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          required
        />
        <Button type="submit" disabled={busy || !note.trim()}>
          Add note
        </Button>
      </form>
      <form
        className="space-y-3 border-t pt-4"
        onSubmit={(event) =>
          void submit(
            event,
            () =>
              createAdjustment({
                data: {
                  staffId,
                  transactionType,
                  amount: Number(amount),
                  reason,
                },
              }),
            "Wallet adjustment recorded.",
            () => {
              setAmount("");
              setReason("");
            },
          )
        }
      >
        <h3 className="font-semibold">Quality bonus or penalty</h3>
        <div className="space-y-2">
          <Label htmlFor="staff-wallet-type">Adjustment</Label>
          <select
            id="staff-wallet-type"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value as typeof transactionType)}
          >
            <option value="quality_bonus">Quality bonus</option>
            <option value="penalty">Penalty</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-wallet-amount">Amount (₹)</Label>
          <Input
            id="staff-wallet-amount"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-wallet-reason">Reason</Label>
          <Input
            id="staff-wallet-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            required
          />
        </div>
        <Button type="submit" disabled={busy || !Number(amount) || !reason.trim()}>
          Record adjustment
        </Button>
      </form>
    </section>
  );
}
