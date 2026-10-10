const token = process.env.SCAN_WORKER_SECRET;
if (!token) throw new Error("SCAN_WORKER_SECRET missing; worker cannot run.");
const response = await fetch("http://127.0.0.1:3000/api/public/hooks/scan-worker", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(240000),
});
if (!response.ok) throw new Error(`Scheduled worker endpoint failed [${response.status}].`);
const result = await response.json();
console.log(
  JSON.stringify({ ran: result.ran, processed: result.processed, reason: result.reason }),
);
