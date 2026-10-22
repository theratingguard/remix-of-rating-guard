import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import {
  analyzeStaffReply,
  assignStaffCases,
  closeStaffCase,
  getAdminStaffData,
  getClientStaffCases,
  getManagerStaffAssignmentData,
  getStaffWorkspace,
  recordStaffSubmission,
  registerStaff,
  recordStaffLogin,
  setStaffStatus,
  updateMyStaffProfile,
  updateMyStaffLiveStatus,
  type StaffProfileInput,
  type StaffRegistrationInput,
} from "@/lib/staff-case.functions";
import { AdminStaffChat } from "@/components/admin-staff-chat";
import { AdminStaffPhaseTwo } from "@/components/admin-staff-phase-two";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const staffKey = ["staff-workspace"];
const adminStaffKey = ["admin-staff-cases"];
const managerAssignmentKey = ["manager-staff-case-assignment"];
const emptyStaff: StaffProfileInput = { name: "", mobile: "", region_city: "", region_state: "" };

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    open: "bg-amber-100 text-amber-900",
    submitted: "bg-orange-100 text-orange-900",
    reply_received: "bg-sky-100 text-sky-900",
    closed: "bg-emerald-100 text-emerald-900",
    active: "bg-emerald-100 text-emerald-900",
    approved: "bg-emerald-100 text-emerald-900",
    rejected: "bg-red-100 text-red-900",
    rework: "bg-violet-100 text-violet-900",
    disabled: "bg-red-100 text-red-900",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] ?? "bg-muted"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function StaffFields({
  value,
  onChange,
  email,
  disabled = false,
}: {
  value: StaffProfileInput;
  onChange: (next: StaffProfileInput) => void;
  email: string;
  disabled?: boolean;
}) {
  const fields: { key: keyof StaffProfileInput; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "mobile", label: "Mobile", type: "tel" },
    { key: "region_city", label: "City" },
    { key: "region_state", label: "State / region" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div className="space-y-2" key={field.key}>
          <Label htmlFor={`staff-${field.key}`}>{field.label}</Label>
          <Input
            id={`staff-${field.key}`}
            type={field.type ?? "text"}
            required
            maxLength={120}
            value={value[field.key]}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
          />
        </div>
      ))}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="staff-email">Signed-in account email</Label>
        <Input id="staff-email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          This profile uses the existing Rating Guard sign-in; no separate login code is created.
        </p>
      </div>
    </div>
  );
}

const staffSkills = [
  ["review_handling", "Review handling"],
  ["negotiation", "Negotiation"],
  ["communication", "Communication"],
  ["evidence_collection", "Evidence collection"],
  ["customer_support", "Customer support"],
  ["case_management", "Case management"],
] as const;

type CapturedLocation = {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  area: string;
  pincode: string;
};

const locationResponseSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  area: z.string(),
  pincode: z.string(),
});

export function StaffRegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(registerStaff);
  const recordLogin = useServerFn(recordStaffLogin);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [teamLead, setTeamLead] = useState("");
  const [referralBy, setReferralBy] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOpen]);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(`Could not check your sign-in: ${sessionError.message}`);
      if (data.session?.user.email) {
        setEmail(data.session.user.email);
        setSignedIn(true);
      }
    });
  }, []);
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function openCamera() {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser does not support secure camera access.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      setCameraOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the camera.");
    }
  }

  async function captureSelfie() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setError("Wait for the live camera preview before capturing your selfie.");
      return;
    }
    const scale = Math.min(1, 1600 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The captured photo could not be processed in this browser.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84),
    );
    if (!photo) {
      setError("The camera image could not be captured. Please try again.");
      return;
    }
    if (photo.size > 5 * 1024 * 1024) {
      setError("The captured photo exceeds the 5 MB limit.");
      return;
    }
    setSelfie(photo);
    setCameraOpen(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setError(null);
  }

  function captureLocation() {
    setLocationBusy(true);
    setError(null);
    if (!navigator.geolocation) {
      setError("Location services are not supported by this browser.");
      setLocationBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch("/api/staff/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: coords.latitude,
              longitude: coords.longitude,
            }),
          });
          const result: unknown = await response.json();
          const parsed = locationResponseSchema.safeParse(result);
          if (!response.ok || !parsed.success)
            throw new Error(
              result && typeof result === "object" && "error" in result
                ? String(result.error)
                : "Could not resolve your location.",
            );
          const address = parsed.data;
          setLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            ...address,
          });
          setCity(address.city);
          setState(address.state);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Could not resolve your location.");
        } finally {
          setLocationBusy(false);
        }
      },
      (cause) => {
        setError(
          cause.code === cause.PERMISSION_DENIED
            ? "Location permission is required to register."
            : "Could not capture your location. Check location services and try again.",
        );
        setLocationBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selfie || !location || !termsAccepted) {
      setError("A live selfie, location, and acceptance of the terms are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      let user = sessionData.session?.user ?? null;
      if (!user) {
        if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              is_staff_registration: true,
              name,
              mobile,
              region_city: city,
              region_state: state,
              address: location.address,
              latitude: location.latitude,
              longitude: location.longitude,
              skills,
              team_lead: teamLead,
              referral_by: referralBy,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
          },
        });
        if (signupError) throw signupError;
        user = data.user;
        if (!data.session || !user) {
          setStatus("confirmation_required");
          return;
        }
      }
      const sessionEmail = user.email;
      if (!sessionEmail) throw new Error("The account has no email address.");
      const photoPath = `${user.id}/selfie-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("staff-photos")
        .upload(photoPath, selfie, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error(`Could not save the live selfie: ${uploadError.message}`);
      const payload: StaffRegistrationInput = {
        name,
        mobile,
        region_city: city,
        region_state: state,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        live_selfie_url: photoPath,
        skills,
        team_lead: teamLead,
        referral_by: referralBy,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      };
      const result = await save({ data: payload });
      await recordLogin();
      await queryClient.invalidateQueries({ queryKey: ["my-staff-profile"] });
      setStatus(result.status);
      toast.success("Staff application sent for superadmin review.");
      if (result.emailNotification === "failed")
        toast.error("Registration saved, but the confirmation email could not be sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Staff registration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "confirmation_required")
    return (
      <main className="grid min-h-screen place-items-center p-5">
        <section className="surface max-w-lg space-y-4 p-6" role="status">
          <h1 className="text-xl font-bold">Email confirmation is still enabled</h1>
          <p className="text-sm text-muted-foreground">
            This project requires email confirmation before a session can upload the required
            selfie. The application record is pending, but the photo could not be uploaded. Contact
            the administrator to disable confirmation, then sign in and finish your registration.
          </p>
          <Button asChild>
            <Link to="/auth">Go to Login</Link>
          </Button>
        </section>
      </main>
    );

  if (status)
    return (
      <main className="grid min-h-screen place-items-center p-5">
        <section className="surface max-w-lg space-y-4 p-6 text-center" role="status">
          <h1 className="text-2xl font-bold">Pending Approval</h1>
          <p className="text-sm text-muted-foreground">
            Your registration, live selfie, and location have been submitted. A superadmin will
            review your application.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              const { error: logoutError } = await supabase.auth.signOut();
              if (logoutError) setError(`Could not log out: ${logoutError.message}`);
              else await navigate({ to: "/auth", replace: true });
            }}
          >
            Logout
          </Button>
          {error && <p role="alert">{error}</p>}
        </section>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-5">
      <PageHeader
        title="Register as Staff"
        subtitle="Create one account and submit your profile for superadmin approval."
        action={
          <Link className="text-sm underline" to="/auth">
            Back to Login
          </Link>
        }
      />
      <form className="surface space-y-6 p-5 sm:p-6" onSubmit={submit}>
        <section className="space-y-3">
          <h2 className="font-semibold">Live selfie (required)</h2>
          {cameraOpen ? (
            <div className="space-y-3">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="max-h-80 w-full rounded-xl bg-black object-contain"
              />
              <Button type="button" onClick={() => void captureSelfie()}>
                Capture live selfie
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => void openCamera()}>
              {selfie ? "Retake live selfie" : "Open camera"}
            </Button>
          )}
          <canvas ref={canvasRef} className="hidden" />
          {selfie && (
            <p className="text-sm text-emerald-700" role="status">
              Live selfie captured ({(selfie.size / 1024).toFixed(0)} KB). Gallery uploads are not
              supported.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Location (required)</h2>
          <Button type="button" variant="outline" disabled={locationBusy} onClick={captureLocation}>
            {locationBusy ? "Finding your address…" : "Capture current location"}
          </Button>
          {location && (
            <div className="rounded-lg border p-3 text-sm" role="status">
              <p className="font-medium">
                Your location: {location.area ? `${location.area}, ` : ""}
                {location.city}, {location.state}
                {location.pincode ? ` - ${location.pincode}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{location.address}</p>
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="registration-name">Name</Label>
            <Input
              id="registration-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration-mobile">Mobile number</Label>
            <Input
              id="registration-mobile"
              required
              type="tel"
              minLength={6}
              maxLength={32}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration-email">Email</Label>
            <Input
              id="registration-email"
              required
              type="email"
              maxLength={320}
              value={email}
              readOnly={signedIn}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {!signedIn && (
            <div className="space-y-2">
              <Label htmlFor="registration-password">Password (minimum 8 characters)</Label>
              <Input
                id="registration-password"
                required
                type="password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="registration-city">City (from location)</Label>
            <Input id="registration-city" readOnly required value={city} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration-state">State (from location)</Label>
            <Input id="registration-state" readOnly required value={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration-team-lead">Team lead (optional)</Label>
            <Input
              id="registration-team-lead"
              maxLength={120}
              value={teamLead}
              placeholder="Enter the team leader's exact name or user ID"
              onChange={(e) => setTeamLead(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This routes your pending application to that team leader for review.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registration-referral">Referred by (optional)</Label>
            <Input
              id="registration-referral"
              maxLength={160}
              value={referralBy}
              onChange={(e) => setReferralBy(e.target.value)}
            />
          </div>
        </section>

        <fieldset className="space-y-2">
          <legend className="font-semibold">Skills</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {staffSkills.map(([skill, label]) => (
              <label className="flex items-center gap-2 text-sm" key={skill}>
                <input
                  type="checkbox"
                  checked={skills.includes(skill)}
                  onChange={(event) =>
                    setSkills((current) =>
                      event.target.checked
                        ? [...current, skill]
                        : current.filter((item) => item !== skill),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
          />
          <span>
            Main confirm karta/karti hoon ki di gayi info sach hai. Main samajhta/samajhti hoon ki
            mera photo, location, IP address aur device information verify aur record kiya jayega.
          </span>
        </label>
        {error && (
          <p className="rounded-lg bg-risk-high-soft px-3 py-2 text-sm text-risk-high" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !selfie || !location || !termsAccepted}>
          {busy ? "Submitting…" : "Submit for approval"}
        </Button>
      </form>
    </main>
  );
}

export function StaffProfilePage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: staffKey, queryFn: useServerFn(getStaffWorkspace) });
  const save = useServerFn(updateMyStaffProfile);
  const saveLiveStatus = useServerFn(updateMyStaffLiveStatus);
  const [form, setForm] = useState<StaffProfileInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const staff = workspace.data?.profile;
  const stats = workspace.data;
  const value =
    form ??
    (staff
      ? {
          name: staff.name,
          mobile: staff.mobile,
          region_city: staff.region_city,
          region_state: staff.region_state,
        }
      : emptyStaff);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await save({ data: value });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      setForm(null);
      setEditing(false);
      toast.success("Staff profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update staff profile.");
    } finally {
      setBusy(false);
    }
  }
  async function updateLiveStatus(live_status: "Available" | "Working" | "Offline") {
    setStatusBusy(true);
    try {
      await saveLiveStatus({ data: { live_status } });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Live status updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update live status.");
    } finally {
      setStatusBusy(false);
    }
  }
  if (workspace.isLoading) return <p>Loading profile…</p>;
  if (workspace.error || !staff)
    return <p role="alert">{workspace.error?.message ?? "Staff profile not found."}</p>;
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Profile" action={<StatusPill status={staff.status} />} />
      {editing ? (
        <form className="surface space-y-5 p-5" onSubmit={submit}>
          <StaffFields value={value} onChange={setForm} email={staff.email} disabled={busy} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setForm(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <section className="surface space-y-4 p-5">
          <div className="max-w-xs space-y-2">
            <Label htmlFor="staff-live-status">Live status</Label>
            <select
              id="staff-live-status"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={staff.live_status}
              disabled={statusBusy}
              onChange={(event) => {
                const selected = event.target.value;
                if (selected === "Available" || selected === "Working" || selected === "Offline")
                  void updateLiveStatus(selected);
              }}
            >
              <option>Available</option>
              <option>Working</option>
              <option>Offline</option>
            </select>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Name", staff.name],
              ["Mobile", staff.mobile],
              ["Email", staff.email],
              ["Region", `${staff.region_city}, ${staff.region_state}`],
              ["Total tasks", stats?.totalTasks ?? 0],
              ["Total removed", stats?.totalRemoved ?? 0],
            ].map(([label, fieldValue]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">{fieldValue}</dd>
              </div>
            ))}
          </dl>
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </section>
      )}
    </main>
  );
}

export function StaffTodayPage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: staffKey, queryFn: useServerFn(getStaffWorkspace) });
  const submitCase = useServerFn(recordStaffSubmission);
  const analyze = useServerFn(analyzeStaffReply);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied. Check every quote and claim before submission.");
    } catch (error) {
      console.error("[staff-cases] Copy failed", error);
      toast.error("Could not copy; select and copy the draft manually.");
    }
  }
  async function recordSubmission(caseId: string) {
    if (
      !window.confirm("Did you personally submit this request through Google's official channel?")
    )
      return;
    setBusyId(caseId);
    try {
      await submitCase({ data: { caseId, confirmed: true } });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Manual submission recorded; Google has not independently verified it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record submission.");
    } finally {
      setBusyId(null);
    }
  }
  async function analyzeReply(caseId: string) {
    setBusyId(caseId);
    try {
      await analyze({ data: { caseId, reply: replyById[caseId] ?? "" } });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Reply analyzed and task moved out of your running list.");
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.error(error instanceof Error ? error.message : "Reply analysis failed.");
    } finally {
      setBusyId(null);
    }
  }
  if (workspace.isLoading) return <p>Loading today's tasks…</p>;
  if (workspace.error || !workspace.data)
    return (
      <main className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Today's Tasks" />
        <div className="surface p-5" role="alert">
          <p>{workspace.error?.message ?? "Could not load staff cases."}</p>
        </div>
      </main>
    );
  const { profile, cases } = workspace.data;
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Today's Tasks" subtitle={`Hi ${profile.name}`} />
      <section className="grid grid-cols-3 gap-3">
        {[
          ["Today's assigned", workspace.data.todayAssigned],
          ["Pending", workspace.data.todayPending],
          ["Completed", workspace.data.todayCompleted],
        ].map(([label, count]) => (
          <div className="surface p-3" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold">{count}</p>
          </div>
        ))}
      </section>
      {!cases.length ? (
        <section className="surface p-6 text-sm text-muted-foreground" role="status">
          No running tasks. Check back later.
        </section>
      ) : (
        cases.map((caseItem) => {
          return (
            <article className="surface space-y-4 p-4 sm:p-6" key={caseItem.id}>
              <h2 className="text-lg font-bold">{caseItem.business_name}</h2>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground">REVIEW</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {caseItem.review_text || "Review text unavailable."}
                </p>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-sm">
                {caseItem.report_text}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyReport(caseItem.report_text)}
                >
                  Copy report
                </Button>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
                  href={caseItem.review_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google review
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                No Google form URL is assumed; use the exact review link and the approved official
                reporting channel. The app does not submit requests.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`staff-reply-${caseItem.id}`}>Paste the actual Google reply</Label>
                <Textarea
                  id={`staff-reply-${caseItem.id}`}
                  rows={3}
                  maxLength={5000}
                  value={replyById[caseItem.id] ?? caseItem.google_reply ?? ""}
                  onChange={(event) =>
                    setReplyById((current) => ({ ...current, [caseItem.id]: event.target.value }))
                  }
                  placeholder="Paste the received reply without editing…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busyId === caseItem.id ||
                    (replyById[caseItem.id] ?? caseItem.google_reply ?? "").trim().length < 3
                  }
                  onClick={() => void analyzeReply(caseItem.id)}
                >
                  {busyId === caseItem.id ? "Working…" : "Analyze reply"}
                </Button>
                <Button
                  type="button"
                  disabled={busyId === caseItem.id}
                  onClick={() => void recordSubmission(caseItem.id)}
                >
                  {busyId === caseItem.id ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </article>
          );
        })
      )}
    </main>
  );
}

export function StaffWalletPage() {
  const workspace = useQuery({ queryKey: staffKey, queryFn: useServerFn(getStaffWorkspace) });
  if (workspace.isLoading) return <p>Loading wallet…</p>;
  if (workspace.error || !workspace.data)
    return <p role="alert">{workspace.error?.message ?? "Could not load wallet."}</p>;
  const { profile, creditHistory } = workspace.data;
  const totalEarnedCredits = creditHistory.reduce((total, item) => total + item.amount, 0);
  const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Wallet" subtitle="Credits are added after a case is closed as removed." />
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Credits", profile.credits],
          ["Value", rupees.format(profile.credits * 10)],
          ["Total earned", rupees.format(totalEarnedCredits * 10)],
        ].map(([label, amount]) => (
          <div className="surface p-4" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{amount}</p>
          </div>
        ))}
      </section>
      <section className="surface space-y-3 p-5">
        <h2 className="font-semibold">Transaction history</h2>
        {creditHistory.length ? (
          <ul className="divide-y">
            {creditHistory.map((item) => (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={item.id}>
                <div>
                  <p className="text-sm font-medium">{item.reason}</p>
                  <time className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                </div>
                <p className="font-semibold text-emerald-700">
                  +{item.amount} credit{item.amount === 1 ? "" : "s"} ·{" "}
                  {rupees.format(item.amount * 10)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No wallet transactions yet.</p>
        )}
      </section>
    </main>
  );
}

export function AdminCaseAssignmentPage() {
  const adminData = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  if (adminData.isLoading) return <p>Loading assignments…</p>;
  if (adminData.error || !adminData.data)
    return <p role="alert">{adminData.error?.message ?? "Could not load assignment data."}</p>;
  return <CaseAssignmentForm data={adminData.data} queryKey={adminStaffKey} />;
}

export function ManagerCaseAssignmentPage() {
  const assignmentData = useQuery({
    queryKey: managerAssignmentKey,
    queryFn: useServerFn(getManagerStaffAssignmentData),
  });
  if (assignmentData.isLoading) return <p>Loading team case assignments…</p>;
  if (assignmentData.error || !assignmentData.data)
    return (
      <p role="alert">
        {assignmentData.error?.message ?? "Could not load team case assignment data."}
      </p>
    );
  return (
    <CaseAssignmentForm data={assignmentData.data} queryKey={managerAssignmentKey} managerMode />
  );
}

function CaseAssignmentForm({
  data,
  queryKey,
  managerMode = false,
}: {
  data: {
    staff: Array<{
      id: string;
      name: string;
      status: string;
      region_city: string;
      region_state: string;
    }>;
    candidates: Array<{
      scan_id: string;
      review_id: string;
      review_url: string;
      business_name: string;
      business_region: string;
    }>;
  };
  queryKey: readonly unknown[];
  managerMode?: boolean;
}) {
  const queryClient = useQueryClient();
  const assign = useServerFn(assignStaffCases);
  const [staffId, setStaffId] = useState("");
  const [pastedUrls, setPastedUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const urls = pastedUrls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  const matched = useMemo(() => {
    const pasted = pastedUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    const available = new Map(
      data.candidates.map((candidate) => [candidate.review_url, candidate]),
    );
    const used = new Set<string>();
    return pasted.map((url) => {
      const candidate = available.get(url);
      const key = candidate ? `${candidate.scan_id}:${candidate.review_id}` : url;
      if (!candidate || used.has(key)) return { url, candidate: null };
      used.add(key);
      return { url, candidate };
    });
  }, [data.candidates, pastedUrls]);
  const eligible = matched.flatMap((entry) =>
    entry.candidate
      ? [{ scanId: entry.candidate.scan_id, reviewId: entry.candidate.review_id }]
      : [],
  );
  async function submit() {
    if (!staffId || eligible.length === 0) return;
    setBusy(true);
    try {
      const result = await assign({ data: { staffId, targets: eligible } });
      toast.success(
        `${result.assignedCount} case${result.assignedCount === 1 ? "" : "s"} assigned.`,
      );
      setPastedUrls("");
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Case assignment failed.");
    } finally {
      setBusy(false);
    }
  }
  const activeStaff = data.staff.filter((row) => ["approved", "active"].includes(row.status));
  const orderedStaff = [...activeStaff].sort((left, right) => {
    const locationScore = (person: (typeof activeStaff)[number]) =>
      eligible.reduce((total, target) => {
        const candidate = data.candidates.find(
          (row) => row.scan_id === target.scanId && row.review_id === target.reviewId,
        );
        const region = candidate?.business_region.toLocaleLowerCase() ?? "";
        const cityMatches = region.includes(person.region_city.trim().toLocaleLowerCase());
        const stateMatches = region.includes(person.region_state.trim().toLocaleLowerCase());
        return total + (cityMatches ? 2 : stateMatches ? 1 : 0);
      }, 0);
    return locationScore(right) - locationScore(left);
  });
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={managerMode ? "Team review-case assignment" : "Client case assignment"}
        subtitle={
          managerMode
            ? "Assign eligible completed-scan reviews to approved staff in your team. Multiple URLs can be assigned as one batch (up to 20)."
            : "Paste exact review URLs from completed scans. Multiple eligible URLs can be assigned as one batch (up to 20)."
        }
      />
      <section className="surface space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="staff-review-urls">Review URL(s), one per line</Label>
          <Textarea
            id="staff-review-urls"
            rows={6}
            placeholder="Paste exact Google Maps review URLs from completed client scans…"
            value={pastedUrls}
            maxLength={12000}
            onChange={(event) => setPastedUrls(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Only exact URLs tied to eligible completed client scans are assignable. An unmatched URL
            will not be assigned.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-assignee">Active staff member</Label>
          <select
            id="staff-assignee"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="">Select staff…</option>
            {orderedStaff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.region_city}, {person.region_state}
              </option>
            ))}
          </select>
        </div>
        {!!urls.length && (
          <section className="space-y-2 rounded-lg border p-3" aria-live="polite">
            <h2 className="text-sm font-semibold">URL validation</h2>
            {matched.map((entry) => (
              <div className="flex flex-wrap justify-between gap-2 text-xs" key={entry.url}>
                <span className="max-w-full break-all">{entry.url}</span>
                <span
                  className={
                    entry.candidate
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-amber-800"
                  }
                >
                  {entry.candidate
                    ? `${entry.candidate.business_name} · eligible`
                    : "No exact eligible match"}
                </span>
              </div>
            ))}
          </section>
        )}
        <p className="text-xs text-muted-foreground">
          Business region is taken from the address captured during the client scan; confirm it
          before assigning. Staff region is a routing convenience only. Cases are due within 24
          hours.
        </p>
        <Button
          disabled={!staffId || !eligible.length || busy || eligible.length > 20}
          onClick={() => void submit()}
        >
          {busy
            ? "Assigning…"
            : `Assign ${eligible.length} eligible case${eligible.length === 1 ? "" : "s"}`}
        </Button>
      </section>
      {!managerMode && (
        <p>
          <Link className="text-sm underline" to="/admin/staff">
            Manage staff registrations
          </Link>
        </p>
      )}
    </main>
  );
}

export function AdminStaffPage() {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const setStatus = useServerFn(setStaffStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [customReasons, setCustomReasons] = useState<Record<string, string>>({});
  async function updateStatus(
    id: string,
    status: "pending" | "approved" | "active" | "rejected" | "disabled",
  ) {
    setBusyId(id);
    try {
      const rejectReason = rejectReasons[id] ?? "incomplete_info";
      const result = await setStatus({
        data: {
          staffId: id,
          status,
          ...(status === "rejected"
            ? { rejectReason, rejectReasonCustom: customReasons[id] ?? "" }
            : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
      toast.success(
        status === "approved"
          ? "Staff approved."
          : status === "rejected"
            ? "Staff rejected."
            : status === "pending"
              ? "Application moved back to pending."
              : `Staff ${status}.`,
      );
      if (result.emailNotification === "failed")
        toast.error("Status updated, but the notification email could not be sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update staff.");
    } finally {
      setBusyId(null);
    }
  }
  if (result.isLoading) return <p>Loading staff dashboard…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load staff."}</p>;
  const { staff, cases, stats } = result.data;
  const statusOrder: Record<string, number> = {
    pending: 0,
    approved: 1,
    active: 1,
    rejected: 2,
  };
  const orderedStaff = [...staff].sort(
    (left, right) =>
      (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3) ||
      Date.parse(right.created_at) - Date.parse(left.created_at),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayActions = result.data.activity.filter(
    (event) => new Date(event.created_at).getTime() >= today.getTime(),
  );
  const todayApprovedIds = new Set(
    todayActions.filter((event) => event.action === "approval").map((event) => event.staff_id),
  );
  const todayRejectedIds = new Set(
    todayActions.filter((event) => event.action === "rejection").map((event) => event.staff_id),
  );
  const visibleStaff = orderedStaff.filter((person) => {
    if (tab === "pending") return person.status === "pending";
    if (tab === "approved") return person.status === "approved" || person.status === "active";
    if (tab === "rejected") return person.status === "rejected";
    return true;
  });
  const relativeTime = (date: string) => {
    const hours = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 3_600_000));
    if (hours < 1) return "less than an hour ago";
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };
  return (
    <main className="space-y-6">
      <PageHeader
        title="Staff approvals"
        subtitle="Review registrations and manage staff access."
        action={
          <Link className="text-sm underline" to="/admin/case-assignment">
            Assign cases
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Pending", staff.filter((person) => person.status === "pending").length],
          ["Approved today", todayApprovedIds.size],
          ["Rejected today", todayRejectedIds.size],
        ].map(([label, value]) => (
          <div className="surface p-4" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section className="grid min-w-0 grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[
          ["Total staff", stats.totalStaff],
          ["Active today", stats.activeToday],
          ["Cases assigned", stats.casesAssigned],
          ["Cases submitted", stats.casesSubmitted],
          ["Cases closed", stats.casesClosed],
          [
            "Avg. handling",
            stats.meanHandlingHours == null ? "—" : `${stats.meanHandlingHours.toFixed(1)} h`,
          ],
        ].map(([label, value]) => (
          <div className="surface min-w-0 p-4" key={label}>
            <p className="break-words text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section className="surface space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Staff status">
          {(["pending", "approved", "rejected", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`rounded-full border px-4 py-2 text-sm capitalize ${tab === value ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => setTab(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {visibleStaff.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleStaff.map((person) => (
              <article
                className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row"
                key={person.id}
              >
                {person.selfie_url ? (
                  <img
                    className="size-24 shrink-0 rounded-lg object-cover"
                    src={person.selfie_url}
                    alt={`Live selfie of ${person.name}`}
                  />
                ) : (
                  <div className="grid size-24 shrink-0 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">
                    No selfie
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      className="font-semibold underline"
                      to="/admin/staff/$id"
                      params={{ id: person.id }}
                    >
                      {person.name}
                    </Link>
                    <StatusPill status={person.status} />
                  </div>
                  <p className="break-all text-sm">
                    {person.email} · {person.mobile}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {person.address ?? `${person.region_city}, ${person.region_state}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Registered {new Date(person.created_at).toLocaleString()} ·{" "}
                    {relativeTime(person.created_at)}
                  </p>
                  <p className="text-xs">
                    Skills: {person.skills.length ? person.skills.join(", ") : "—"} · Referred by:{" "}
                    {person.referral_by ?? "—"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {person.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === person.id}
                          onClick={() => void updateStatus(person.id, "approved")}
                        >
                          Approve
                        </Button>
                        <select
                          aria-label={`Rejection reason for ${person.name}`}
                          className="h-9 rounded-md border bg-background px-2 text-xs"
                          value={rejectReasons[person.id] ?? "incomplete_info"}
                          onChange={(event) =>
                            setRejectReasons((current) => ({
                              ...current,
                              [person.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="fake_account">Fake account</option>
                          <option value="duplicate">Duplicate</option>
                          <option value="suspicious_location">Suspicious location</option>
                          <option value="incomplete_info">Incomplete information</option>
                          <option value="other">Other</option>
                        </select>
                        {(rejectReasons[person.id] ?? "incomplete_info") === "other" && (
                          <Input
                            className="h-9 w-40"
                            aria-label={`Custom rejection reason for ${person.name}`}
                            maxLength={500}
                            value={customReasons[person.id] ?? ""}
                            onChange={(event) =>
                              setCustomReasons((current) => ({
                                ...current,
                                [person.id]: event.target.value,
                              }))
                            }
                          />
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={
                            busyId === person.id ||
                            ((rejectReasons[person.id] ?? "incomplete_info") === "other" &&
                              !customReasons[person.id]?.trim())
                          }
                          onClick={() => void updateStatus(person.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {person.status === "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === person.id}
                        onClick={() => void updateStatus(person.id, "pending")}
                      >
                        Send to Pending
                      </Button>
                    )}
                    {person.status === "approved" || person.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === person.id}
                        onClick={() => void updateStatus(person.id, "disabled")}
                      >
                        Disable
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/admin/staff/$id" params={{ id: person.id }}>
                        View Full
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No staff members in this tab.
          </p>
        )}
      </section>
      <p>
        <Link className="text-sm underline" to="/admin/cases">
          Open all cases
        </Link>
      </p>
    </main>
  );
}

export function AdminCasesPage() {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const close = useServerFn(closeStaffCase);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function closeCase(caseId: string) {
    if (!window.confirm("Close this internal case? This does not assert any removal outcome."))
      return;
    setBusyId(caseId);
    try {
      await close({ data: { caseId } });
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
      toast.success("Case closed and work log updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close the case.");
    } finally {
      setBusyId(null);
    }
  }
  if (result.isLoading) return <p>Loading case list…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load cases."}</p>;
  return (
    <main className="space-y-5">
      <PageHeader
        title="All staff cases"
        action={
          <Link className="text-sm underline" to="/admin/case-assignment">
            Assign case
          </Link>
        }
      />
      <section className="surface overflow-x-auto p-4">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Business</th>
              <th>Staff</th>
              <th>Status</th>
              <th>Policy area</th>
              <th>Assigned</th>
              <th>Work log</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {result.data.cases.map((item) => (
              <tr className="border-b" key={item.id}>
                <td className="p-2">
                  {item.business_name}
                  <span className="block text-xs text-muted-foreground">
                    {item.business_region}
                  </span>
                </td>
                <td>
                  {result.data.staff.find((person) => person.id === item.staff_id)?.name ??
                    "Unknown"}
                </td>
                <td>
                  <StatusPill status={item.status} />
                </td>
                <td>{item.policy_angle || "—"}</td>
                <td>{new Date(item.assigned_at).toLocaleDateString()}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">
                      {result.data.events.filter((event) => event.case_id === item.id).length}{" "}
                      events
                    </summary>
                    <ol className="min-w-48 space-y-2 py-2">
                      {result.data.events
                        .filter((event) => event.case_id === item.id)
                        .map((event) => (
                          <li className="border-l-2 pl-2 text-xs" key={event.id}>
                            <p className="font-medium">{event.event_type.replaceAll("_", " ")}</p>
                            <time className="text-muted-foreground">
                              {new Date(event.created_at).toLocaleString()}
                            </time>
                          </li>
                        ))}
                    </ol>
                  </details>
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.status === "closed" || busyId === item.id}
                    onClick={() => void closeCase(item.id)}
                  >
                    {item.status === "closed" ? "Closed" : "Close case"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export function AdminStaffDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const saveStatus = useServerFn(setStaffStatus);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("incomplete_info");
  const [customReason, setCustomReason] = useState("");
  async function updateStatus(status: "pending" | "approved" | "rejected") {
    setBusy(true);
    try {
      const updated = await saveStatus({
        data: {
          staffId: id,
          status,
          ...(status === "rejected" ? { rejectReason, rejectReasonCustom: customReason } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
      toast.success(
        status === "approved"
          ? "Staff approved."
          : status === "rejected"
            ? "Staff rejected."
            : "Application moved back to pending.",
      );
      if (updated.emailNotification === "failed")
        toast.error("Status updated, but the notification email could not be sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update staff status.");
    } finally {
      setBusy(false);
    }
  }
  if (result.isLoading) return <p>Loading staff record…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load staff."}</p>;
  const person = result.data.staff.find((row) => row.id === id);
  if (!person) return <p role="alert">Staff member not found.</p>;
  const cases = result.data.cases.filter((row) => row.staff_id === id);
  const activity = result.data.activity.filter((row) => row.staff_id === id);
  const submittedCases = cases.filter((item) =>
    ["submitted", "reply_received", "approved", "rework", "completed", "closed"].includes(
      item.status,
    ),
  );
  const reviewedCases = cases.filter((item) => ["approved", "rework"].includes(item.status));
  const mapUrl =
    person.latitude != null && person.longitude != null
      ? `https://maps.google.com/maps?q=${person.latitude},${person.longitude}&z=15&output=embed`
      : null;
  return (
    <main className="space-y-5">
      <PageHeader
        title={person.name}
        subtitle={`${person.region_city}, ${person.region_state} · ${person.email}`}
        action={
          <Link className="text-sm underline" to="/admin/staff">
            All staff
          </Link>
        }
      />
      {person.selfie_url && (
        <section className="surface p-4">
          <img
            className="mx-auto max-h-[560px] w-full rounded-xl object-contain"
            src={person.selfie_url}
            alt={`Live selfie of ${person.name}`}
          />
        </section>
      )}
      <section className="surface grid gap-3 p-5 sm:grid-cols-3">
        <p>Email: {person.email}</p>
        <p>Mobile: {person.mobile}</p>
        <p>Status: {person.status}</p>
        <p>Applied: {new Date(person.created_at).toLocaleString()}</p>
        <p>
          Region: {person.region_city}, {person.region_state}
        </p>
        <p>Address: {person.address ?? "—"}</p>
        <p>IP address: {person.ip_address ?? "Not captured"}</p>
        <p>Device: {person.user_agent ?? "Not captured"}</p>
        <p>Timezone: {person.timezone ?? "—"}</p>
        <p>Role: {person.role}</p>
        <p>Team lead: {person.team_lead ?? "—"}</p>
        <p>Skills: {person.skills.length ? person.skills.join(", ") : "—"}</p>
        <p>Live status: {person.live_status}</p>
        <p>
          Last active: {person.last_seen_at ? new Date(person.last_seen_at).toLocaleString() : "—"}
        </p>
        <p>Referred by: {person.referral_by ?? "—"}</p>
        <p>
          Approved at: {person.approved_at ? new Date(person.approved_at).toLocaleString() : "—"}
        </p>
        <p>Cases assigned: {cases.length}</p>
      </section>
      {mapUrl && (
        <section className="surface space-y-3 p-4">
          <h2 className="font-bold">Captured location</h2>
          <iframe
            className="h-72 w-full rounded-lg border"
            src={mapUrl}
            title={`Captured registration location for ${person.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </section>
      )}
      <section className="surface space-y-4 p-5">
        <h2 className="font-bold">Activity log</h2>
        {activity.length ? (
          <ol className="space-y-3 border-l pl-4">
            {activity.map((event) => (
              <li className="relative space-y-1" key={event.id}>
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                <p className="font-medium capitalize">{event.action.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                  {event.ip_address ? ` · ${event.ip_address}` : ""}
                </p>
                {event.user_agent && (
                  <p className="break-all text-xs text-muted-foreground">{event.user_agent}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded activity.</p>
        )}
      </section>
      <section className="surface space-y-4 p-5">
        <h2 className="font-bold">Submitted work</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <p>Cases assigned: {cases.length}</p>
          <p>Cases submitted: {submittedCases.length}</p>
          <p>Approved / rework: {reviewedCases.length}</p>
        </div>
        {cases.map((item) => (
          <article className="rounded-lg border p-3" key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{item.business_name}</p>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Assigned {new Date(item.assigned_at).toLocaleString()}
              {item.submitted_at
                ? ` · Submitted ${new Date(item.submitted_at).toLocaleString()}`
                : ""}
              {item.closed_at ? ` · Closed ${new Date(item.closed_at).toLocaleString()}` : ""}
            </p>
            <a
              className="mt-2 inline-block text-sm underline"
              href={item.review_url}
              target="_blank"
              rel="noreferrer"
            >
              Open source review
            </a>
          </article>
        ))}
      </section>
      <AdminStaffPhaseTwo staffId={person.id} monthlyTarget={person.monthly_task_target} />
      <AdminStaffChat staffId={person.id} staffName={person.name} />
      <section className="sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        {person.status === "pending" && (
          <>
            <Button disabled={busy} onClick={() => void updateStatus("approved")}>
              Approve
            </Button>
            <select
              aria-label="Rejection reason"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
            >
              <option value="fake_account">Fake account</option>
              <option value="duplicate">Duplicate</option>
              <option value="suspicious_location">Suspicious location</option>
              <option value="incomplete_info">Incomplete information</option>
              <option value="other">Other</option>
            </select>
            {rejectReason === "other" && (
              <Input
                aria-label="Custom rejection reason"
                className="h-9 max-w-xs"
                maxLength={500}
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
              />
            )}
            <Button
              variant="destructive"
              disabled={busy || (rejectReason === "other" && !customReason.trim())}
              onClick={() => void updateStatus("rejected")}
            >
              Reject
            </Button>
          </>
        )}
        {person.status === "rejected" && (
          <Button variant="outline" disabled={busy} onClick={() => void updateStatus("pending")}>
            Send to Pending
          </Button>
        )}
      </section>
    </main>
  );
}

export function ClientStaffWorkLog({ scanId }: { scanId: string }) {
  const load = useServerFn(getClientStaffCases);
  const result = useQuery({
    queryKey: ["client-staff-case-log", scanId],
    queryFn: () => load({ data: { scanId } }),
  });
  if (result.isLoading)
    return <p className="mt-4 text-sm text-muted-foreground">Loading case-handler work log…</p>;
  if (result.error)
    return (
      <p className="mt-4 text-sm" role="alert">
        Could not load case-handler log: {result.error.message}
      </p>
    );
  const cases = result.data?.cases ?? [];
  const events = result.data?.events ?? [];
  if (!cases.length) return null;
  const names: Record<string, string> = {
    client_reported: "Client review report received",
    case_assigned: "Case assigned to authorized staff",
    report_prepared: "Evidence-based draft prepared",
    submission_recorded: "Manual submission recorded",
    reply_received: "Google reply recorded",
    reply_analyzed: "Reply analyzed (advisory)",
    next_action_taken: "Next action recorded",
    case_closed: "Case closed",
  };
  return (
    <section className="mt-6 space-y-4 border-t pt-5" aria-label="Case handler work log">
      <h3 className="font-semibold">Case handler work log</h3>
      {cases.map((item) => (
        <article className="rounded-lg border p-3" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {item.business_name} · {item.policy_angle}
            </p>
            <StatusPill status={item.status} />
          </div>
          {item.ai_status && (
            <p className="mt-1 text-xs text-muted-foreground">
              Advisory response status: {item.ai_status}; not verified. {item.ai_next_step}
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {events
              .filter((event) => event.case_id === item.id)
              .map((event) => (
                <li className="border-l-2 pl-3 text-xs" key={event.id}>
                  <p className="font-medium">{names[event.event_type] ?? "Case activity"}</p>
                  <time className="text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
          </ol>
        </article>
      ))}
      <p className="text-xs text-muted-foreground">
        Submission records are staff-reported. Google decisions are not independently verified by
        this app.
      </p>
    </section>
  );
}
