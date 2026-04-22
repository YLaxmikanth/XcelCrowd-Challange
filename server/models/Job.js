const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },

  capacity: {
    type: Number,
    required: true,
    min: 1
  },

  description: String,

  location: String,

  roles: String,

  requirements: String,

  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  activeCount: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ["OPEN", "CLOSED"],
    default: "OPEN"
  },

  nextQueuePosition: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

module.exports = mongoose.model("Job", jobSchema);
