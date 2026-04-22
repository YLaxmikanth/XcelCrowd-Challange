const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      unique: true
    },
    password: String,
    role: {
      type: String,
      enum: ["COMPANY", "CANDIDATE"],
      required: true
    },
    profile: {
      company: {
        companyName: String,
        website: String,
        location: String,
        industry: String,
        description: String
      },
      candidate: {
        phone: String,
        location: String,
        headline: String,
        experience: String,
        skills: String,
        portfolio: String,
        resume: {
          fileName: String,
          fileType: String,
          fileSize: Number,
          dataUrl: String
        }
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
