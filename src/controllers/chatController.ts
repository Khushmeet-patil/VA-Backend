import { Request, Response } from 'express';
import chatService from '../services/chatService';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import ChatSession from '../models/ChatSession';

/**
 * Chat Controller
 * Handles REST API endpoints for chat functionality.
 * Real-time events are handled via Socket.IO.
 */

interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
}

/**
 * POST /chat/request
 * User initiates a chat request with an astrologer
 */
export const requestChat = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { astrologerId, intakeDetails } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!astrologerId) {
            return res.status(400).json({ message: 'astrologerId is required' });
        }

        const session = await chatService.createChatRequest(userId, astrologerId, intakeDetails);

        res.status(201).json({
            message: 'Chat request sent',
            sessionId: session.sessionId,
            status: session.status,
            ratePerMinute: session.ratePerMinute
        });

    } catch (error: any) {
        console.error('Chat request error:', error);
        res.status(400).json({ message: error.message || 'Failed to create chat request' });
    }
};

/**
 * POST /chat/accept
 * Astrologer accepts a pending chat request
 */
export const acceptChat = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;
        const { sessionId } = req.body;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can accept chats' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        // Verify session belongs to this astrologer
        const session = await chatService.getSession(sessionId);
        if (!session || session.astrologerId.toString() !== astrologerId) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const updatedSession = await chatService.acceptChatRequest(sessionId);

        res.json({
            message: 'Chat accepted',
            sessionId: updatedSession.sessionId,
            status: updatedSession.status,
            startTime: updatedSession.startTime
        });

    } catch (error: any) {
        console.error('Accept chat error:', error);
        res.status(400).json({ message: error.message || 'Failed to accept chat' });
    }
};

/**
 * POST /chat/reject
 * Astrologer rejects a pending chat request
 */
export const rejectChat = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;
        const { sessionId } = req.body;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can reject chats' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        // Verify session belongs to this astrologer
        const session = await chatService.getSession(sessionId);
        if (!session || session.astrologerId.toString() !== astrologerId) {
            return res.status(404).json({ message: 'Session not found' });
        }

        await chatService.rejectChatRequest(sessionId);

        res.json({ message: 'Chat rejected' });

    } catch (error: any) {
        console.error('Reject chat error:', error);
        res.status(400).json({ message: error.message || 'Failed to reject chat' });
    }
};

/**
 * POST /chat/cancel
 * User cancels a pending chat request
 */
export const cancelChat = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { sessionId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!sessionId) {
            return res.status(400).json({ message: 'sessionId is required' });
        }

        const result = await chatService.cancelChatRequest(sessionId, userId);

        if (result.cancelled) {
            res.json({
                message: 'Chat request cancelled',
                cancelled: true
            });
        } else {
            // Return appropriate status based on reason
            const statusCode = result.reason === 'already_started' ? 409 : 400;
            res.status(statusCode).json({
                message: `Cannot cancel: ${result.reason}`,
                cancelled: false,
                reason: result.reason
            });
        }

    } catch (error: any) {
        console.error('Cancel chat error:', error);
        res.status(400).json({ message: error.message || 'Failed to cancel chat request' });
    }
};

/**
 * POST /chat/end
 * Either party ends an active chat
 */
export const endChat = async (req: AuthRequest, res: Response) => {
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

        // Verify participant
        const session = await chatService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const isUser = userRole !== 'astrologer' && session.userId.toString() === userId;
        const isAstrologer = userRole === 'astrologer' && session.astrologerId.toString() === userId;

        if (!isUser && !isAstrologer) {
            return res.status(403).json({ message: 'Not a participant in this session' });
        }

        const endReason = isUser ? 'USER_END' : 'ASTROLOGER_END';
        const updatedSession = await chatService.endChat(sessionId, endReason);

        res.json({
            message: 'Chat ended',
            sessionId: updatedSession.sessionId,
            totalMinutes: updatedSession.totalMinutes,
            totalAmount: updatedSession.totalAmount
        });

    } catch (error: any) {
        console.error('End chat error:', error);
        res.status(400).json({ message: error.message || 'Failed to end chat' });
    }
};

/**
 * POST /chat/review
 * User submits a review for a completed session
 */
export const submitReview = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { sessionId, rating, reviewText } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!sessionId || !rating) {
            return res.status(400).json({ message: 'sessionId and rating are required' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        await chatService.submitReview(sessionId, userId, rating, reviewText);

        res.json({ message: 'Review submitted successfully' });

    } catch (error: any) {
        console.error('Submit review error:', error);
        res.status(400).json({ message: error.message || 'Failed to submit review' });
    }
};

/**
 * GET /chat/session/:sessionId
 * Get details of a specific session
 */
export const getSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;
        const { sessionId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const session = await chatService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        // Verify participant
        const isUser = userRole !== 'astrologer' && session.userId.toString() === userId;
        const isAstrologer = userRole === 'astrologer' && session.astrologerId.toString() === userId;

        if (!isUser && !isAstrologer) {
            return res.status(403).json({ message: 'Not a participant in this session' });
        }

        res.json({ session });

    } catch (error: any) {
        console.error('Get session error:', error);
        res.status(500).json({ message: 'Failed to get session' });
    }
};

/**
 * GET /chat/history/:sessionId
 * Get messages for a specific session
 */
export const getChatHistory = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;
        const { sessionId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Verify participant
        const session = await chatService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const isUser = userRole !== 'astrologer' && session.userId.toString() === userId;
        const isAstrologer = userRole === 'astrologer' && session.astrologerId.toString() === userId;

        if (!isUser && !isAstrologer) {
            return res.status(403).json({ message: 'Not a participant in this session' });
        }

        const messages = await chatService.getMessages(sessionId);

        res.json({ messages });

    } catch (error: any) {
        console.error('Get chat history error:', error);
        res.status(500).json({ message: 'Failed to get chat history' });
    }
};

/**
 * GET /chat/active
 * Get current active session for the authenticated user
 */
export const getActiveSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        let session;
        if (userRole === 'astrologer') {
            session = await chatService.getActiveSessionForAstrologer(userId);
        } else {
            session = await chatService.getActiveSessionForUser(userId);
        }

        if (!session) {
            return res.json({ active: false, session: null });
        }

        res.json({ active: true, session });

    } catch (error: any) {
        console.error('Get active session error:', error);
        res.status(500).json({ message: 'Failed to get active session' });
    }
};

/**
 * GET /chat/pending
 * Get pending chat requests for astrologer
 */
export const getPendingRequests = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId;

        if (!astrologerId || req.userRole !== 'astrologer') {
            return res.status(403).json({ message: 'Only astrologers can view pending requests' });
        }

        const pendingRequests = await ChatSession.find({
            astrologerId,
            status: 'PENDING'
        }).populate('userId', 'name mobile');

        res.json({ requests: pendingRequests });

    } catch (error: any) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ message: 'Failed to get pending requests' });
    }
};

/**
 * GET /chat/conversation/:partnerId
 * Get all messages between authenticated user and a partner (user-astrologer pair)
 * For users: partnerId = astrologerId
 * For astrologers: partnerId = userId
 * Query params: limit (default 50), before (ISO timestamp for pagination)
 */
export const getConversation = async (req: AuthRequest, res: Response) => {
    try {
        const currentUserId = req.userId;
        const userRole = req.userRole;
        const { partnerId } = req.params;
        const { limit = '50', before } = req.query;

        if (!currentUserId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (!partnerId) {
            return res.status(400).json({ message: 'partnerId is required' });
        }

        let userId: string;
        let astrologerId: string;

        if (userRole === 'astrologer') {
            astrologerId = currentUserId;
            userId = partnerId;
        } else {
            userId = currentUserId;
            astrologerId = partnerId;
        }

        const beforeDate = before ? new Date(before as string) : undefined;
        const limitNum = parseInt(limit as string, 10) || 50;

        const result = await chatService.getConversation(userId, astrologerId, limitNum, beforeDate);

        res.json({
            messages: result.messages,
            hasMore: result.hasMore
        });

    } catch (error: any) {
        console.error('Get conversation error:', error);
        res.status(500).json({ message: 'Failed to get conversation' });
    }
};

/**
 * GET /chat/sessions
 * Get all chat sessions for the authenticated user (for history screen)
 */
export const getUserSessions = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        let sessions;
        if (userRole === 'astrologer') {
            // For astrologers, get sessions where they are the astrologer
            sessions = await ChatSession.find({
                astrologerId: userId,
                status: { $in: ['COMPLETED', 'ENDED', 'CANCELLED'] }
            })
                .populate('userId', 'name mobile')
                .sort({ createdAt: -1 })
                .limit(50);
        } else {
            // For users, get sessions where they are the user
            sessions = await ChatSession.find({
                userId: userId,
                status: { $in: ['COMPLETED', 'ENDED', 'CANCELLED', 'ACTIVE', 'PENDING'] }
            })
                .populate('astrologerId', 'firstName lastName')
                .sort({ createdAt: -1 })
                .limit(50);
        }

        res.json({ sessions });

    } catch (error: any) {
        console.error('Get user sessions error:', error);
        res.status(500).json({ message: 'Failed to get sessions' });
    }
};
