const express = require("express");
const router = express.Router();

const { createJob } = require("../controllers/jobController");
const authMiddleware = require("../middleware/authMiddleware");
const requireRole = require("../middleware/roleMiddleware");
const { applyToJob } = require("../services/applyService");
const { runPromotion } = require("../services/promotionService");
const { sendShortlistedEmail } = require("../config/mailer");

const Event = require("../models/Event");

const isActiveStatus = (status) =>
  ["ACTIVE_PENDING_ACK", "ACTIVE_CONFIRMED"].includes(status);

// =======================
// Company: Create Job
// =======================
router.post("/", authMiddleware, requireRole("COMPANY"), createJob);

// =======================
// Candidate: List Open Jobs
// =======================
router.get("/open", authMiddleware, requireRole("CANDIDATE"), async (req, res) => {
  try {
    const jobs = await Job.find({ status: "OPEN" }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// Company: List Jobs
// =======================
router.get("/", authMiddleware, requireRole("COMPANY"), async (req, res) => {
  try {
    const jobs = await Job.find({ companyId: req.user.id }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =======================
// Candidate: My Applications
// =======================
router.get(
  "/applications/me",
  authMiddleware,
  requireRole("CANDIDATE"),
  async (req, res) => {
    try {
      const applications = await Applicant.find({ userId: req.user.id })
        .populate("jobId", "title capacity status activeCount")
        .sort({ createdAt: -1 });

      const payload = await Promise.all(
        applications.map(async (application) => {
          const totalQueueSize = await Applicant.countDocuments({
            jobId: application.jobId?._id || application.jobId,
            status: "WAITLISTED"
          });

          const estimatedWaitMinutes =
            application.status === "WAITLISTED"
              ? Math.max(application.queuePosition || 0, 1) * 5
              : 0;

          return {
            _id: application._id,
            name: application.name,
            status: application.status,
            queuePosition: application.queuePosition,
            ackDeadline: application.ackDeadline,
            totalQueueSize,
            estimatedWaitMinutes,
            job: application.jobId
          };
        })
      );

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Candidate: Apply to Job
// =======================
router.post(
  "/:id/apply",
  authMiddleware,
  requireRole("CANDIDATE"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!req.body.resume?.fileName) {
        return res.status(400).json({ error: "Resume is required" });
      }

      const applicant = await applyToJob(
        req.params.id,
        req.body.name,
        {
          id: req.user.id,
          email: user?.email
        },
        req.body.resume
      );

      res.json(applicant);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// =======================
// Company: Applicant Pipeline
// =======================
router.get(
  "/:id/pipeline",
  authMiddleware,
  requireRole("COMPANY"),
  async (req, res) => {
    try {
      // Ensure job belongs to company
      const job = await Job.findOne({ _id: req.params.id, companyId: req.user.id });
      if (!job) {
        return res.status(404).json({ error: "Job not found or access denied" });
      }

      const applicants = await Applicant.find({
        jobId: req.params.id
      }).sort({ queuePosition: 1, createdAt: 1 });

      // Sanitize: remove sensitive data
      const sanitized = applicants.map(app => ({
        _id: app._id,
        name: app.name,
        email: app.email,
        status: app.status,
        queuePosition: app.queuePosition,
        ackDeadline: app.ackDeadline,
        createdAt: app.createdAt
      }));

      res.json(sanitized);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Company: Close Job
// =======================
router.post(
  "/:id/close",
  authMiddleware,
  requireRole("COMPANY"),
  async (req, res) => {
    try {
      const job = await Job.findByIdAndUpdate(
        req.params.id,
        { status: "CLOSED" },
        { new: true }
      );

      if (!job) return res.status(404).json({ error: "Job not found" });

      res.json(job);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Company: Exit Applicant
// =======================
router.post(
  "/applicant/:id/exit",
  authMiddleware,
  requireRole("COMPANY"),
  async (req, res) => {
    try {
      const applicant = await Applicant.findById(req.params.id);

      if (!applicant) {
        return res.status(404).json({ error: "Applicant not found" });
      }

      // Only allow exit from ACTIVE states
      if (!isActiveStatus(applicant.status)) {
        if (applicant.status === "EXITED") {
          return res.json({ message: "Applicant already exited", applicant });
        }
        return res.status(400).json({ error: "Can only exit from ACTIVE states" });
      }

      const transitioned = await transitionApplicant({
        applicantId: req.params.id,
        fromState: applicant.status,
        toState: "EXITED",
        reason: "Manual exit",
        applicantUpdates: {
          queuePosition: null,
          ackDeadline: null
        }
      });

      if (transitioned) {
        await runPromotion(applicant.jobId);
        res.json({
          message: "Applicant exited and promotion triggered",
          applicant: transitioned
        });
      } else {
        res.json({ message: "Applicant already exited", applicant });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Get Applicant Events
// =======================
router.get(
  "/applications/:id/events",
  authMiddleware,
  async (req, res) => {
    try {
      const applicant = await Applicant.findById(req.params.id);

      if (!applicant) {
        return res.status(404).json({ error: "Applicant not found" });
      }

      // Security: Candidates can only see their own events, Companies can see events for applicants in their jobs
      if (req.user.role === "CANDIDATE") {
        if (applicant.userId.toString() !== req.user.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (req.user.role === "COMPANY") {
        const job = await Job.findOne({ _id: applicant.jobId, companyId: req.user.id });
        if (!job) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const events = await Event.find({ applicantId: req.params.id })
        .sort({ timestamp: 1 });

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Company: Force Promote
// =======================
router.post(
  "/applicant/:id/force-promote",
  authMiddleware,
  requireRole("COMPANY"),
  async (req, res) => {
    try {
      const applicant = await Applicant.findById(req.params.id);

      if (!applicant) {
        return res.status(404).json({ error: "Applicant not found" });
      }

      if (applicant.status !== "WAITLISTED") {
        return res.status(400).json({ error: "Only waitlisted applicants can be promoted" });
      }

      const job = await Job.findById(applicant.jobId);
      if (!job) return res.status(404).json({ error: "Job not found" });
      if (job.status === "CLOSED") return res.status(400).json({ error: "Job is closed" });
      if (job.activeCount >= job.capacity) {
        return res.status(400).json({ error: "No active slots are available" });
      }

      applicant.status = "ACTIVE_PENDING_ACK";
      applicant.queuePosition = null;
      applicant.ackDeadline = new Date(Date.now() + 5 * 60 * 1000);
      await applicant.save();

      job.activeCount += 1;
      await job.save();
      await sendShortlistedEmail(applicant);

      res.json(applicant);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// =======================
// Candidate: Acknowledge Active Slot
// =======================
router.post(
  "/applicant/:id/acknowledge",
  authMiddleware,
  requireRole("CANDIDATE"),
  async (req, res) => {
    try {
      const applicant = await Applicant.findOne({
        _id: req.params.id,
        userId: req.user.id
      });

      if (!applicant) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (applicant.status !== "ACTIVE_PENDING_ACK") {
        return res.status(400).json({ error: "This application does not need acknowledgement" });
      }

      applicant.status = "ACTIVE_CONFIRMED";
      applicant.ackDeadline = null;
      await applicant.save();

      res.json(applicant);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
