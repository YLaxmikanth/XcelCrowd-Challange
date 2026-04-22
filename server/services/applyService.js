const mongoose = require("mongoose");
const Job = require("../models/Job");
const Applicant = require("../models/Applicant");
const { sendShortlistedEmail } = require("../config/mailer");

exports.applyToJob = async (jobId, name, user = {}, resume = null) => {
  if (!name || !user.id) {
    throw new Error("Name and userId are required");
  }

  const session = await mongoose.startSession();

  try {
    let applicant = null;

    await session.withTransaction(async () => {
      const existingJob = await Job.findById(jobId).session(session);

      if (!existingJob) {
        throw new Error("Job not found");
      }

      if (existingJob.status === "CLOSED") {
        throw new Error("This job is closed and no longer accepts applications");
      }

      // 🔥 ATOMIC SLOT CLAIM
      const job = await Job.findOneAndUpdate(
        {
          _id: jobId,
          status: "OPEN",
          $expr: { $lt: ["$activeCount", "$capacity"] }
        },
        { $inc: { activeCount: 1 } },
        { returnDocument: "after", session }
      );

      // ✅ If slot available → ACTIVE
      if (job) {
        applicant = await Applicant.create([{
          jobId,
          name,
          email: user.email,
          resume,
          userId: user.id,
          status: "ACTIVE_PENDING_ACK",
          ackDeadline: new Date(Date.now() + 5 * 60 * 1000)
        }], { session });

        applicant = applicant[0];
      } else {
        // ❌ Otherwise → WAITLIST
        const updatedJob = await Job.findByIdAndUpdate(
          jobId,
          { $inc: { nextQueuePosition: 1 } },
          { returnDocument: "after", session }
        );

        applicant = await Applicant.create([{
          jobId,
          name,
          email: user.email,
          resume,
          userId: user.id,
          status: "WAITLISTED",
          queuePosition: updatedJob.nextQueuePosition
        }], { session });

        applicant = applicant[0];
      }
    });

    if (applicant && applicant.status === "ACTIVE_PENDING_ACK") {
      await sendShortlistedEmail(applicant);
    }

    return applicant;
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};
