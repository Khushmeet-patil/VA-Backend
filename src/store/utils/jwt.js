const jwt = require("jsonwebtoken");

exports.generateToken = (payload) => {
  return jwt.sign(payload, process.env.STORE_JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, process.env.STORE_JWT_SECRET);
};
