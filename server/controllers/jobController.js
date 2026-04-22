const Job = require("../models/Job");

// ✅ Create Job
exports.createJob = async (req, res) => {
  try {
    const { title, capacity, description, location, roles, requirements } = req.body;

    if (!title || !capacity || capacity <= 0) {
      return res.status(400).json({ error: "Title and valid capacity (>0) are required" });
    }

    const job = await Job.create({
      title,
      capacity,
      description,
      location,
      roles,
      requirements,
      companyId: req.user.id
    });

    res.status(201).json({
      _id: job._id,
      title: job.title,
      capacity: job.capacity,
      description: job.description,
      location: job.location,
      roles: job.roles,
      requirements: job.requirements,
      status: job.status,
      activeCount: job.activeCount,
      createdAt: job.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
