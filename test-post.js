fetch("https://kailee-fey-lillyana.ngrok-free.dev/api/webhooks/mtn", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ping: "ok" })
}).then(r => {
  console.log("Status:", r.status);
  return r.text();
}).then(t => console.log("Body:", t))
  .catch(console.error);
