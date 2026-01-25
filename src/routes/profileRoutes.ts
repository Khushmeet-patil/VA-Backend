import express from 'express';
import { getProfiles, createProfile, deleteProfile, updateProfile, getProfileById } from '../controllers/profileController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET /profiles - Get all saved birth profiles
router.get('/', getProfiles);

// GET /profiles/:id - Get a single birth profile by ID
router.get('/:id', getProfileById);

// POST /profiles - Create a new birth profile
router.post('/', createProfile);

// PUT /profiles/:id - Update a birth profile
router.put('/:id', updateProfile);

// DELETE /profiles/:id - Delete a birth profile
router.delete('/:id', deleteProfile);

export default router;
