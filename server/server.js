const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.get("/", (req, res) => {
  res.send("🚀 XcelCrowd API running");
});
const PORT = process.env.PORT || 5000;
const jobRoutes = require("./routes/jobRoutes");
app.use("/jobs", jobRoutes);
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(" Failed to start server:", error.message);
    process.exit(1);
  }
};
const authRoutes = require("./routes/authRoutes");

app.use("/auth", authRoutes);
startServer();
require("./jobs/worker");
