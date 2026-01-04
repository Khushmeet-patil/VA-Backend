import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import chatService from './chatService';

/**
 * Socket.IO Event Handlers
 * 
 * Manages real-time connections and message delivery.
 * Authentication, room management, and message relay.
 */

interface AuthenticatedSocket extends Socket {
    userId?: string;
    userType?: 'user' | 'astrologer';
}

/**
 * Initialize Socket.IO handlers
 */
export function initializeSocketHandlers(io: SocketIOServer): void {
    // Initialize chat service with io instance
    chatService.initialize(io);

    // Authentication middleware for Socket.IO
    io.use(async (socket: AuthenticatedSocket, next) => {
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                return next(new Error('Authentication required'));
            }

            const decoded = jwt.verify(
                token as string,
                process.env.JWT_SECRET || 'secret'
            ) as { id: string; role?: string };

            // Determine if user or astrologer
            if (decoded.role === 'astrologer') {
                const astrologer = await Astrologer.findById(decoded.id);
                if (!astrologer) {
                    return next(new Error('Astrologer not found'));
                }
                socket.userId = decoded.id;
                socket.userType = 'astrologer';
            } else {
                const user = await User.findById(decoded.id);
                if (!user) {
                    return next(new Error('User not found'));
                }
                socket.userId = decoded.id;
                socket.userType = 'user';
            }

            next();
        } catch (error) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        const userId = socket.userId!;
        const userType = socket.userType!;

        console.log(`[Socket] ${userType} connected: ${userId}`);

        // Join user-specific room for targeted events
        const roomName = `${userType}:${userId}`;
        socket.join(roomName);

        // Handle reconnect (clear grace period if any)
        chatService.handleReconnect(userId, userType === 'astrologer');

        // Handle sending messages
        socket.on('send_message', async (data: { sessionId: string; text: string }) => {
            try {
                const { sessionId, text } = data;

                if (!sessionId || !text) {
                    socket.emit('error', { message: 'sessionId and text are required' });
                    return;
                }

                // Verify session exists and is active
                const session = await chatService.getSession(sessionId);
                if (!session || session.status !== 'ACTIVE') {
                    socket.emit('error', { message: 'Invalid or inactive session' });
                    return;
                }

                // Verify sender is part of session
                const isParticipant =
                    (userType === 'user' && session.userId.toString() === userId) ||
                    (userType === 'astrologer' && session.astrologerId.toString() === userId);

                if (!isParticipant) {
                    socket.emit('error', { message: 'Not a participant in this session' });
                    return;
                }

                // Save message
                await chatService.saveMessage(sessionId, userId, userType, text);

                // Broadcast to session room
                const message = {
                    messageId: Date.now().toString(),
                    senderId: userId,
                    senderType: userType,
                    text,
                    timestamp: new Date().toISOString()
                };

                // Emit to both participants
                io.to(`user:${session.userId}`).emit('RECEIVE_MESSAGE', {
                    sessionId,
                    ...message
                });
                io.to(`astrologer:${session.astrologerId}`).emit('RECEIVE_MESSAGE', {
                    sessionId,
                    ...message
                });

            } catch (error) {
                console.error('[Socket] Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle end chat request
        socket.on('end_chat', async (data: { sessionId: string }) => {
            try {
                const { sessionId } = data;

                const session = await chatService.getSession(sessionId);
                if (!session || session.status !== 'ACTIVE') {
                    socket.emit('error', { message: 'Invalid or inactive session' });
                    return;
                }

                // Verify sender is part of session
                const isUser = userType === 'user' && session.userId.toString() === userId;
                const isAstrologer = userType === 'astrologer' && session.astrologerId.toString() === userId;

                if (!isUser && !isAstrologer) {
                    socket.emit('error', { message: 'Not a participant in this session' });
                    return;
                }

                const endReason = isUser ? 'USER_END' : 'ASTROLOGER_END';
                await chatService.endChat(sessionId, endReason);

            } catch (error) {
                console.error('[Socket] End chat error:', error);
                socket.emit('error', { message: 'Failed to end chat' });
            }
        });

        // Handle accept chat (for astrologers)
        socket.on('accept_chat', async (data: { sessionId: string }) => {
            try {
                if (userType !== 'astrologer') {
                    socket.emit('error', { message: 'Only astrologers can accept chats' });
                    return;
                }

                await chatService.acceptChatRequest(data.sessionId);

            } catch (error: any) {
                console.error('[Socket] Accept chat error:', error);
                socket.emit('error', { message: error.message || 'Failed to accept chat' });
            }
        });

        // Handle reject chat (for astrologers)
        socket.on('reject_chat', async (data: { sessionId: string }) => {
            try {
                if (userType !== 'astrologer') {
                    socket.emit('error', { message: 'Only astrologers can reject chats' });
                    return;
                }

                await chatService.rejectChatRequest(data.sessionId);

            } catch (error: any) {
                console.error('[Socket] Reject chat error:', error);
                socket.emit('error', { message: error.message || 'Failed to reject chat' });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket] ${userType} disconnected: ${userId}`);
            chatService.handleDisconnect(userId, userType === 'astrologer');
        });
    });

    console.log('[Socket] Handlers initialized');
}

export default initializeSocketHandlers;
