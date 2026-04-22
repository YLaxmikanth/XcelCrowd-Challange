const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Applicant",
      required: true
    },

    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true
    },

    fromState: {
      type: String,
      required: true
    },

    toState: {
      type: String,
      required: true
    },

    reason: {
      type: String,
      required: true
    },

    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  { timestamps: true }
);

eventSchema.index({ applicantId: 1, timestamp: -1 });
eventSchema.index({ jobId: 1, timestamp: -1 });

module.exports = mongoose.model("Event", eventSchema);
