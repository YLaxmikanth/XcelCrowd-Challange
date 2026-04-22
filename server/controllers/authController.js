const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const toSafeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  profile: user.profile || {}
});

// Signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role
    });

    res.status(201).json(toSafeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(toSafeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) return res.status(404).json({ error: "User not found" });

    const nextProfile = {
      ...(user.profile?.toObject ? user.profile.toObject() : user.profile || {})
    };

    if (user.role === "COMPANY") {
      nextProfile.company = {
        ...(nextProfile.company || {}),
        ...(req.body.company || {})
      };
    }

    if (user.role === "CANDIDATE") {
      nextProfile.candidate = {
        ...(nextProfile.candidate || {}),
        ...(req.body.candidate || {})
      };
    }

    user.profile = nextProfile;
    await user.save();

    res.json(toSafeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
