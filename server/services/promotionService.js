const Applicant = require("../models/Applicant");
const Job = require("../models/Job");
const { sendShortlistedEmail } = require("../config/mailer");
const { transitionApplicant } = require("./transitionService");

const ACK_WINDOW_MS = 5 * 60 * 1000;

const hasAvailableSlot = async (jobId) => {
  return await Job.exists({
    _id: jobId,
    status: "OPEN",
    $expr: { $lt: ["$activeCount", "$capacity"] }
  });
};

const pickNextWaitlistedApplicant = async (jobId) => {
  return await Applicant.findOneAndUpdate(
    {
      jobId,
      status: "WAITLISTED",
      $or: [
        { cooldownUntil: { $exists: false } },
        { cooldownUntil: { $lte: new Date() } }
      ]
    },
    {
      $set: { status: "PROMOTION_IN_PROGRESS" }
    },
    {
      sort: { queuePosition: 1 },
      returnDocument: "after"
    }
  );
};

const releasePromotionCandidate = async (applicantId) => {
  await Applicant.updateOne(
    {
      _id: applicantId,
      status: "PROMOTION_IN_PROGRESS"
    },
    {
      $set: { status: "WAITLISTED" }
    }
  );
};

exports.runPromotion = async (jobId) => {
  while (await hasAvailableSlot(jobId)) {
    const applicant = await pickNextWaitlistedApplicant(jobId);

    if (!applicant) break;

    try {
      const promotedApplicant = await transitionApplicant({
        applicantId: applicant._id,
        fromState: "PROMOTION_IN_PROGRESS",
        toState: "ACTIVE_PENDING_ACK",
        reason: "Promotion",
        applicantUpdates: {
          queuePosition: null,
          ackDeadline: new Date(Date.now() + ACK_WINDOW_MS)
        }
      });

      if (promotedApplicant?.status === "ACTIVE_PENDING_ACK") {
        await sendShortlistedEmail(promotedApplicant);
        console.log("Promoted:", promotedApplicant.name);
      }
    } catch (error) {
      await releasePromotionCandidate(applicant._id);

      if (error.message === "Unable to update job capacity for transition") {
        break;
      }

      throw error;
    }
  }
};
