import { Request, Response } from 'express';
import callService from '../services/callService';
import User from '../models/User';
import CallSession from '../models/CallSession';

interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
}

/**
 * Utility to mask session and user data for astrologers
 */
const maskSessionForAstrologer = (session: any) => {
    if (!session) return null;
    
    const sessionObj = session.toObject ? session.toObject() : JSON.parse(JSON.stringify(session));
    
    // Mask intakeDetails name
    if (sessionObj.intakeDetails && sessionObj.intakeDetails.name) {
        const name = sessionObj.intakeDetails.name;
        const isNamePhone = /\d{10,}/.test(name.replace(/[\s-]/g, ''));
        if (isNamePhone) sessionObj.intakeDetails.name = 'User';
    }

    // Mask populated user
    if (sessionObj.userId && typeof sessionObj.userId === 'object') {
        const name = sessionObj.userId.name || 'User';
        const isNamePhone = /\d{10,}/.test(name.replace(/[\s-]/g, ''));
        sessionObj.userId.name = isNamePhone ? 'User' : name;
        sessionObj.userId.mobile = ''; // Hide mobile
    }

    return sessionObj;
};

/**
 * POST /call/request
 * User initiates a call request (voice/video) with an astrologer
 */
export const requestCall = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { astrologerId, intakeDetails, sessionType } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!astrologerId) {
            return res.status(400).json({ message: 'astrologerId is required' });
        }

        const session = await callService.createCallRequest(userId, astrologerId, intakeDetails, sessionType);

        res.status(201).json({
            message: 'Call request sent',
            sessionId: session.sessionId,
            status: session.status,
            ratePerMinute: session.ratePerMinute
        });

    } catch (error: any) {
        console.error('Call request error:', error);
        res.status(400).json({ message: error.message || 'Failed to create call request' });
    }
};

/**
 * POST /call/accept
 * Astrologer accepts a pending call request
 */
export const acceptCall = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;
        const { sessionId } = req.body;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can accept calls' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        // Verify session belongs to this astrologer
        const session = await callService.getSession(sessionId);
        if (!session || session.astrologerId.toString() !== astrologerId) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const updatedSession = await callService.acceptCallRequest(sessionId);
        const user = await User.findById(updatedSession.userId);
        const name = user?.name || 'User';
        const isNamePhone = /^[0-9+ ]{10,15}$/.test(name.trim());

        res.json({
            message: 'Call accepted',
            sessionId: updatedSession.sessionId,
            status: updatedSession.status,
            startTime: updatedSession.startTime,
            ratePerMinute: updatedSession.ratePerMinute,
            userId: updatedSession.userId?._id || updatedSession.userId,
            userName: isNamePhone ? 'User' : name,
            userMobile: '', // Hide from astrologer
            intakeDetails: updatedSession.intakeDetails,
            isFreeTrialSession: false,
            freeTrialDurationSeconds: 0,
            sessionType: updatedSession.sessionType,
        });

    } catch (error: any) {
        console.error('Accept call error:', error);
        res.status(400).json({ message: error.message || 'Failed to accept call' });
    }
};

/**
 * POST /call/reject
 * Astrologer rejects a pending call request
 */
export const rejectCall = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;
        const { sessionId } = req.body;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can reject calls' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        // Verify session belongs to this astrologer
        const session = await callService.getSession(sessionId);
        if (!session || session.astrologerId.toString() !== astrologerId) {
            return res.status(404).json({ message: 'Session not found' });
        }

        await callService.rejectCallRequest(sessionId);

        res.json({ success: true, message: 'Call request rejected' });

    } catch (error: any) {
        console.error('Reject call error:', error);
        res.status(400).json({ message: error.message || 'Failed to reject call' });
    }
};

/**
 * POST /call/cancel
 * User cancels their pending call request
 */
export const cancelCall = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { sessionId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        const result = await callService.cancelCallRequest(sessionId, userId);

        if (result.cancelled) {
            res.json({ success: true, message: 'Call request cancelled' });
        } else {
            res.status(400).json({ success: false, message: result.reason || 'Failed to cancel call request' });
        }

    } catch (error: any) {
        console.error('Cancel call error:', error);
        res.status(400).json({ message: error.message || 'Failed to cancel call request' });
    }
};

/**
 * POST /call/end
 * Either user or astrologer ends the active call session
 */
export const endCall = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;
        const { sessionId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        const session = await callService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify sender is participant
        const isUser = userRole === 'user' && session.userId.toString() === userId;
        const isAstrologer = userRole === 'astrologer' && session.astrologerId.toString() === userId;

        if (!isUser && !isAstrologer) {
            return res.status(403).json({ message: 'Not a participant in this call session' });
        }

        const endReason = isUser ? 'USER_END' : 'ASTROLOGER_END';
        const endedSession = await callService.endCall(sessionId, endReason);

        res.json({
            message: 'Call ended successfully',
            sessionId: endedSession.sessionId,
            status: endedSession.status,
            totalMinutes: endedSession.totalMinutes,
            totalAmount: endedSession.totalAmount,
            astrologerEarnings: endedSession.astrologerEarnings
        });

    } catch (error: any) {
        console.error('End call error:', error);
        res.status(400).json({ message: error.message || 'Failed to end call' });
    }
};

/**
 * GET /call/active
 * Get current active call session for the authenticated user/astrologer
 */
export const getActiveCall = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        let session;
        if (userRole === 'astrologer') {
            session = await callService.getActiveCallForAstrologer(userId);
        } else {
            session = await callService.getActiveCallForUser(userId);
        }

        if (!session) {
            return res.json({ active: false, session: null });
        }

        res.json({ 
            active: true, 
            session: userRole === 'astrologer' ? maskSessionForAstrologer(session) : session 
        });

    } catch (error: any) {
        console.error('Get active call error:', error);
        res.status(500).json({ message: 'Failed to get active call' });
    }
};

/**
 * GET /call/pending
 * Get pending call requests for astrologer
 */
export const getPendingRequests = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can view pending requests' });
        }

        const pendingRequests = await CallSession.find({
            astrologerId,
            status: 'PENDING'
        }).populate('userId', 'name mobile');

        const maskedRequests = pendingRequests.map(r => maskSessionForAstrologer(r));

        res.json({ requests: maskedRequests });

    } catch (error: any) {
        console.error('Get pending calls error:', error);
        res.status(500).json({ message: 'Failed to get pending calls' });
    }
};

/**
 * GET /call/session/:sessionId
 * Get detailed CallSession by sessionId
 */
export const getCallSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;
        const { sessionId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const session = await callService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Check if user is a participant
        const isUser = userRole === 'user' && session.userId.toString() === userId;
        const isAstrologer = userRole === 'astrologer' && session.astrologerId.toString() === userId;

        if (!isUser && !isAstrologer) {
            return res.status(403).json({ message: 'Unauthorized access to session details' });
        }

        res.json({
            session: userRole === 'astrologer' ? maskSessionForAstrologer(session) : session
        });

    } catch (error: any) {
        console.error('Get call session details error:', error);
        res.status(500).json({ message: 'Failed to get call session details' });
    }
};

/**
 * GET /call/sessions
 * Get history of ended calls for the authenticated user/astrologer
 */
export const getUserCalls = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        let sessions;
        if (userRole === 'astrologer') {
            sessions = await CallSession.find({
                astrologerId: userId,
                status: 'ENDED'
            })
                .populate('userId', 'name mobile')
                .sort({ createdAt: -1 })
                .limit(50);
        } else {
            sessions = await CallSession.find({
                userId: userId,
                status: 'ENDED',
                userJoined: true,
                astrologerJoined: true
            })
                .populate('astrologerId', 'firstName lastName profilePhoto')
                .sort({ createdAt: -1 })
                .limit(50);
        }

        res.json({ sessions });

    } catch (error: any) {
        console.error('Get user calls error:', error);
        res.status(500).json({ message: 'Failed to get call history' });
    }
};
