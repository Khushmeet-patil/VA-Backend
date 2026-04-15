module.exports = (roles = []) => {
  // Ensure roles is always an array
  if (!Array.isArray(roles)) {
    roles = [roles];
  }

  return (req, res, next) => {
    // auth.middleware must run before this
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    // Check if user's role is allowed
    if (!roles.includes(req.user.role)) {
      console.log(`🔴 [Role Middleware] 403 Forbidden: User ${req.user._id} (${req.user.role}) denied access. Allowed roles: [${roles.join(', ')}]`);
      return res.status(403).json({
        error: "Forbidden: insufficient permissions",
      });
    }

    next();
  };
};
