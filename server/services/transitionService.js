const mongoose = require("mongoose");
const Applicant = require("../models/Applicant");
const Event = require("../models/Event");
const Job = require("../models/Job");

const ACTIVE_STATES = new Set(["ACTIVE_PENDING_ACK", "ACTIVE_CONFIRMED"]);

const isActiveState = (status) => ACTIVE_STATES.has(status);

const getActiveCountDelta = (fromState, toState) => {
  const wasActive = isActiveState(fromState);
  const isActive = isActiveState(toState);

  if (!wasActive && isActive) return 1;
  if (wasActive && !isActive) return -1;
  return 0;
};

const transitionApplicant = async ({
  applicantId,
  fromState,
  toState,
  reason,
  applicantUpdates = {}
}) => {
  if (!applicantId) throw new Error("applicantId is required");
  if (!fromState) throw new Error("fromState is required");
  if (!toState) throw new Error("toState is required");
  if (!reason) throw new Error("reason is required");

  const session = await mongoose.startSession();

  try {
    let updatedApplicant = null;

    await session.withTransaction(async () => {
      const applicant = await Applicant.findById(applicantId).session(session);

      if (!applicant) {
        throw new Error("Applicant not found");
      }

      if (applicant.status !== fromState) {
        console.log("Skipping duplicate transition:", applicant.status, "!==", fromState);
        updatedApplicant = applicant;
        return;
      }

      console.log("Transition:", fromState, "→", toState, "reason:", reason);

      const activeCountDelta = getActiveCountDelta(fromState, toState);

      if (activeCountDelta !== 0) {
        const jobFilter = { _id: applicant.jobId };
        const jobUpdate = { $inc: { activeCount: activeCountDelta } };

        if (activeCountDelta > 0) {
          jobFilter.status = "OPEN";
          jobFilter.$expr = { $lt: ["$activeCount", "$capacity"] };
        } else {
          jobFilter.activeCount = { $gt: 0 };
        }

        const job = await Job.findOneAndUpdate(jobFilter, jobUpdate, {
          new: true,
          session
        });

        if (!job) {
          throw new Error("Unable to update job capacity for transition");
        }
      }

      applicant.status = toState;

      Object.assign(applicant, applicantUpdates);

      updatedApplicant = await applicant.save({ session });

      await Event.create(
        [
          {
            applicantId: applicant._id,
            jobId: applicant.jobId,
            fromState,
            toState,
            reason,
            timestamp: new Date()
          }
        ],
        { session }
      );
    });

    return updatedApplicant;
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

const checkInvariants = async (jobId) => {
  const job = await Job.findById(jobId);
  if (!job) return;

  const activeApplicants = await Applicant.countDocuments({
    jobId,
    status: { $in: ["ACTIVE_PENDING_ACK", "ACTIVE_CONFIRMED"] }
  });

  const isConsistent = job.activeCount === activeApplicants && job.activeCount <= job.capacity;

  if (!isConsistent) {
    console.warn(`Invariant violation for job ${jobId}: activeCount=${job.activeCount}, actualActive=${activeApplicants}, capacity=${job.capacity}`);
  }

  return isConsistent;
};

module.exports = {
  transitionApplicant,
  checkInvariants
};
