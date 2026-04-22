const Applicant = require("../models/Applicant");
const Job = require("../models/Job");
const { runPromotion } = require("./promotionService");
const { transitionApplicant } = require("./transitionService");

exports.runDecay = async () => {

  const now = new Date();
  console.log("Current Time:", now);

  const expired = await Applicant.find({
    status: "ACTIVE_PENDING_ACK",
    ackDeadline: { $exists: true, $ne: null, $lte: now }
  });

  console.log("Expired found:", expired.length);

  if (expired.length === 0) return;

  // 🔥 Track affected jobs (avoid duplicate promotions)
  const affectedJobs = new Set();

  for (let app of expired) {

    console.log("Decaying:", app.name);

    affectedJobs.add(app.jobId.toString());
    // Only process if still ACTIVE_PENDING_ACK (prevent duplicate processing)
    if (app.status !== "ACTIVE_PENDING_ACK") {
      console.log("Skipping already processed applicant:", app._id);
      continue;
    }
    // � push to end of queue
    const job = await Job.findByIdAndUpdate(
      app.jobId,
      { $inc: { nextQueuePosition: 1 } },
      { returnDocument: "after" }
    );

    await transitionApplicant({
      applicantId: app._id,
      fromState: "ACTIVE_PENDING_ACK",
      toState: "WAITLISTED",
      reason: "Decay timeout",
      applicantUpdates: {
        queuePosition: job.nextQueuePosition,
        ackDeadline: null,
        cooldownUntil: new Date(now.getTime() + 5 * 60 * 1000)
      }
    });
  }

  // 🔥 Run promotion once per job
  for (let jobId of affectedJobs) {
    console.log("Running promotion for job:", jobId);
    await runPromotion(jobId);
  }
};