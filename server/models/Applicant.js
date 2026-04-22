const mongoose = require("mongoose");

const applicantSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true
  },

  name: {
    type: String,
    required: true
  },

  email: String,

  resume: {
    fileName: String,
    fileType: String,
    fileSize: Number,
    dataUrl: String
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  status: {
    type: String,
    enum: [
      "WAITLISTED",
      "PROMOTION_IN_PROGRESS",
      "ACTIVE_PENDING_ACK",
      "ACTIVE_CONFIRMED",
      "EXITED"
    ],
    default: "WAITLISTED"
  },

  queuePosition: Number,

  ackDeadline: Date,

  cooldownUntil: Date

}, { timestamps: true });

// 🔥 important index
applicantSchema.index({ jobId: 1, queuePosition: 1 });
applicantSchema.index({ userId: 1, createdAt: -1 });
applicantSchema.index({ jobId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Applicant", applicantSchema);
