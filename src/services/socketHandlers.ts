import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import chatService from './chatService';
import fcmService from './fcmService';

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

        // Join user-specific room for targeted events
        const roomName = `${userType}:${userId}`;
        socket.join(roomName);

        // Enhanced logging for debugging
        console.log(`[Socket] ${userType} connected: ID=${userId}, Room=${roomName}, SocketID=${socket.id}`);

        // Handle reconnect (clear grace period if any)
        chatService.handleReconnect(userId, userType === 'astrologer');

        // Handle sending messages
        socket.on('send_message', async (data: {
            sessionId: string;
            text: string;
            type?: 'text' | 'image' | 'file';
            fileData?: { url: string; name?: string; size?: number };
            replyToId?: string;
        }) => {
            try {
                const { sessionId, text, type = 'text', fileData, replyToId } = data;

                console.log('[Socket] send_message received:', { sessionId, type, hasFileData: !!fileData, from: userType });

                if (!sessionId) {
                    socket.emit('error', { message: 'sessionId is required' });
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
                const savedMsg = await chatService.saveMessage(sessionId, userId, socket.userType!, text, type, fileData, replyToId);

                // Fetch reply message if replyToId was provided
                let replyTo: { id: string; text: string; sender: string; type?: string; fileUrl?: string } | undefined;
                if (replyToId) {
                    const replyMsg = await chatService.getMessage(replyToId);
                    if (replyMsg) {
                        replyTo = {
                            id: replyMsg._id.toString(),
                            text: replyMsg.text || '',
                            sender: replyMsg.senderType,
                            type: replyMsg.type,
                            fileUrl: replyMsg.fileUrl,
                        };
                    }
                }

                // Broadcast to session room
                const message = {
                    messageId: savedMsg._id.toString(),
                    senderId: userId,
                    senderType: userType,
                    text,
                    type,
                    fileUrl: savedMsg.fileUrl,
                    fileName: savedMsg.fileName,
                    fileSize: savedMsg.fileSize,
                    replyTo, // Include fully populated reply object
                    timestamp: savedMsg.timestamp.toISOString(),
                    status: 'sent'
                };

                // Log rooms and message content
                const userRoom = `user:${session.userId}`;
                const astrologerRoom = `astrologer:${session.astrologerId}`;
                console.log('[Socket] Broadcasting RECEIVE_MESSAGE:', {
                    userRoom,
                    astrologerRoom,
                    type: message.type,
                    fileUrl: message.fileUrl,
                    hasReplyTo: !!replyTo
                });

                // Emit to both participants
                io.to(userRoom).emit('RECEIVE_MESSAGE', {
                    sessionId,
                    ...message
                });
                io.to(astrologerRoom).emit('RECEIVE_MESSAGE', {
                    sessionId,
                    ...message
                });

                // Check if recipient is in the room
                const room = io.sockets.adapter.rooms.get(sessionId);
                const roomSize = room ? room.size : 0;

                // If only 1 person in room (the sender), then recipient is offline/background
                if (roomSize <= 1) {
                    // console.log(`[Socket] Recipient not in room ${sessionId}, sending FCM notification`);

                    // Get session to find recipient
                    const session = await chatService.getSession(sessionId);
                    if (session) {
                        let recipientToken: string | undefined;

                        // Determine recipient based on sender type
                        if (userType === 'user') {
                            const astrologer = await Astrologer.findById(session.astrologerId);
                            recipientToken = astrologer?.fcmToken;
                        } else {
                            const user = await User.findById(session.userId);
                            recipientToken = user?.fcmToken;
                        }

                        if (recipientToken) {
                            const senderName = userType === 'user' ? 'User' : 'Astrologer';
                            // Improving name resolution
                            let actualSenderName = senderName;
                            let senderPhoto: string | undefined;

                            if (userType === 'user') {
                                const u = await User.findById(userId);
                                actualSenderName = u?.name || 'User';
                                senderPhoto = u?.profilePhoto;
                            } else {
                                const a = await Astrologer.findById(userId);
                                actualSenderName = a?.firstName || 'Astrologer';
                                senderPhoto = a?.profilePhoto;
                            }

                            await fcmService.sendMessageNotification(
                                recipientToken,
                                actualSenderName,
                                text || (type === 'image' ? 'Sent an image' : 'Sent a file'),
                                sessionId,
                                userId,
                                userType,
                                senderPhoto
                            );
                        }
                    }
                }

            } catch (error) {
                console.error('[Socket] Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing indicator
        socket.on('typing', async (data: { sessionId: string; isTyping: boolean }) => {
            try {
                const { sessionId, isTyping } = data;
                const session = await chatService.getSession(sessionId);
                if (!session || session.status !== 'ACTIVE') return;

                const targetRoom = userType === 'user'
                    ? `astrologer:${session.astrologerId}`
                    : `user:${session.userId}`;

                io.to(targetRoom).emit('TYPING_STATUS', {
                    sessionId,
                    userId,
                    userType,
                    isTyping
                });
            } catch (error) {
                console.error('[Socket] Typing error:', error);
            }
        });

        // Handle message status update (read receipt)
        socket.on('message_status', async (data: { sessionId: string; messageId: string; status: 'delivered' | 'read' }) => {
            try {
                const { sessionId, messageId, status } = data;
                const session = await chatService.getSession(sessionId);
                if (!session) return;

                await chatService.updateMessageStatus(messageId, status);

                const targetRoom = userType === 'user'
                    ? `astrologer:${session.astrologerId}`
                    : `user:${session.userId}`;

                io.to(targetRoom).emit('MESSAGE_STATUS_UPDATE', {
                    sessionId,
                    messageId,
                    status
                });
            } catch (error) {
                console.error('[Socket] Message status update error:', error);
            }
        });

        // Handle join chat (handshake)
        socket.on('join_chat', async (data: { sessionId: string }) => {
            try {
                const { sessionId } = data;
                if (!sessionId) return;

                await chatService.joinSession(sessionId, userType);
            } catch (error) {
                console.error('[Socket] Join chat error:', error);
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

                // Check if this is a "cancelled or expired" error - handle gracefully
                if (error.message && error.message.includes('cancelled or expired')) {
                    // Emit a specific event so the astrologer app can show a proper notification
                    socket.emit('CHAT_ACCEPT_FAILED', {
                        sessionId: data.sessionId,
                        reason: 'User cancelled the request before you could accept'
                    });
                } else {
                    socket.emit('error', { message: error.message || 'Failed to accept chat' });
                }
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

        // Handle continue chat request (for users)
        socket.on('continue_chat_request', async (data: { astrologerId: string; previousSessionId: string }) => {
            try {
                if (userType !== 'user') {
                    socket.emit('error', { message: 'Only users can request continue chat' });
                    return;
                }

                const { astrologerId, previousSessionId } = data;
                console.log(`[Socket] Continue chat request from user ${userId} for astrologer ${astrologerId}`);

                const session = await chatService.createContinueChatRequest(userId, astrologerId, previousSessionId);

                // Emit confirmation to user
                socket.emit('CONTINUE_CHAT_REQUEST_SENT', {
                    sessionId: session.sessionId,
                    astrologerId,
                    previousSessionId
                });

            } catch (error: any) {
                console.error('[Socket] Continue chat request error:', error);
                socket.emit('CONTINUE_CHAT_ERROR', { message: error.message || 'Failed to send continue chat request' });
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
