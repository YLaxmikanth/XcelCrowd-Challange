const { runDecay } = require("../services/decayService");

setInterval(async () => {
  console.log("⏳ Checking for expired applicants...");
  await runDecay();
}, 5000); // every 5 seconds