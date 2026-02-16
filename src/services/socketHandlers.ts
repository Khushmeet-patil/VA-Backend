import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import chatService from './chatService';
import notificationService from './notificationService';

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
                const savedMsg = await chatService.saveMessage(sessionId, userId, userType, text, type, fileData, replyToId);

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

                // FALLBACK: Check if this message is actually a Shared Profile sent as text
                // Format: 👤 Name: ... ⚧️ Gender: ... 📅 DOB: ...
                if (type === 'text' && text.includes('Name:') && text.includes('DOB:') && text.includes('TOB:') && text.includes('POB:')) {
                    console.log('[Socket] Detected Shared Profile in text message, triggering auto-share...');
                    try {
                        const profile: any = {};

                        // Parse multiline text
                        const lines = text.split('\n');
                        lines.forEach(line => {
                            if (line.includes('Name:')) profile.name = line.split('Name:')[1].trim();
                            if (line.includes('Gender:')) profile.gender = line.split('Gender:')[1].trim();
                            if (line.includes('DOB:')) {
                                const dob = line.split('DOB:')[1].trim(); // e.g. "26 Dec 2004"
                                profile.dob = dob;
                                // Simple parsing for DD Mon YYYY or DD-MM-YYYY
                                const date = new Date(dob);
                                if (!isNaN(date.getTime())) {
                                    profile.day = date.getDate();
                                    profile.month = date.getMonth() + 1;
                                    profile.year = date.getFullYear();
                                }
                            }
                            if (line.includes('TOB:')) {
                                const tob = line.split('TOB:')[1].trim(); // e.g. "12:00 AM"
                                profile.tob = tob;
                                // Parse 12hr time
                                const match = tob.match(/(\d+):(\d+)\s*(AM|PM)/i);
                                if (match) {
                                    let h = parseInt(match[1]);
                                    let m = parseInt(match[2]);
                                    if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
                                    if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
                                    profile.hour = h;
                                    profile.min = m;
                                }
                            }
                            if (line.includes('POB:')) {
                                profile.pob = line.split('POB:')[1].trim().replace('"', ''); // Remove quote if present
                                // Note: Lat/Lon won't be in text usually, but better than nothing
                                // If coordinates are needed, User App MUST send proper event or text must include them
                            }
                        });

                        // Only share if we extracted enough data
                        if (profile.name && profile.dob) {
                            // ENRICH: Try to find real profile in database to get lat/lon
                            try {
                                const user = await User.findById(session.userId);
                                if (user) {
                                    console.log('[Socket] Searching DB for profile match:', profile.name);
                                    // Search in birthProfiles
                                    const match = user.birthProfiles.find(bp =>
                                        bp.name.toLowerCase().trim() === profile.name.toLowerCase().trim()
                                    );

                                    if (match) {
                                        console.log('[Socket] Enriched text-profile with DB data (lat/lon)');
                                        profile.lat = match.lat;
                                        profile.lon = match.lon;
                                        profile.hour = match.hour;
                                        profile.min = match.min;
                                        profile._id = match._id;
                                        profile.tzone = match.tzone;
                                    } else if (user.name?.toLowerCase().trim() === profile.name.toLowerCase().trim()) {
                                        // Match with primary user details
                                        profile.lat = user.lat;
                                        profile.lon = user.lon;
                                        profile.hour = user.hour;
                                        profile.min = user.min;
                                        profile._id = 'primary';
                                        profile.tzone = user.tzone;
                                    }
                                }
                            } catch (enrichError) {
                                console.error('[Socket] Enrichment error:', enrichError);
                            }

                            // Assign a random ID if still none
                            if (!profile._id) profile._id = new Date().getTime().toString();

                            console.log('[Socket] Auto-sharing extracted profile:', profile);
                            await chatService.shareProfile(sessionId, profile);
                        }
                    } catch (parseError) {
                        console.error('[Socket] Failed to parse profile text:', parseError);
                    }
                }

                // Send FCM push notification to the OTHER participant if they're not connected
                // This handles cases when recipient is offline, app in background, or on different screen
                try {
                    const targetRoom = userType === 'user' ? astrologerRoom : userRoom;
                    const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
                    const recipientConnected = roomSockets && roomSockets.size > 0;

                    if (!recipientConnected) {
                        // Recipient not connected via socket, send FCM notification
                        const senderName = userType === 'user'
                            ? (await User.findById(userId))?.name || 'User'
                            : (await Astrologer.findById(userId))?.firstName || 'Astrologer';

                        const recipientId = userType === 'user'
                            ? session.astrologerId.toString()
                            : session.userId.toString();
                        const recipientType = userType === 'user' ? 'astrologer' : 'user';

                        // Get astrologer info for user app navigation
                        const astrologer = await Astrologer.findById(session.astrologerId);

                        await notificationService.sendChatMessageNotification(
                            recipientId,
                            recipientType,
                            senderName,
                            type === 'text' ? text : `Sent a ${type}`,
                            sessionId,
                            session.astrologerId.toString(),
                            astrologer ? `${astrologer.firstName} ${astrologer.lastName}` : undefined
                        );
                    }
                } catch (fcmError) {
                    // Don't fail the message send if FCM fails
                    console.error('[Socket] FCM notification error:', fcmError);
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

        // Handle share profile logic
        socket.on('share_profile', async (data: { sessionId: string, profile: any }) => {
            console.log('[Socket] share_profile event received:', data);
            try {
                const { sessionId, profile } = data;
                if (!sessionId || !profile) return;

                // ENRICH: Try to find real profile in database to get lat/lon
                let enrichedProfile = { ...profile };
                try {
                    const session = await chatService.getSession(sessionId);
                    if (session) {
                        const user = await User.findById(session.userId);
                        if (user) {
                            const targetId = profile._id || profile.id || profile.profileId;
                            console.log('[Socket] Searching DB for profile enrichment ID:', targetId);

                            // 1. Try matching by ID in birthProfiles
                            let match = user.birthProfiles.find(bp =>
                                bp._id?.toString() === targetId?.toString()
                            );

                            // 2. Try matching by Index if targetId is numeric
                            if (!match && targetId !== undefined && /^\d+$/.test(targetId.toString())) {
                                const index = parseInt(targetId.toString());
                                if (index >= 0 && index < user.birthProfiles.length) {
                                    console.log('[Socket] Enriched by Index match:', index);
                                    match = user.birthProfiles[index];
                                }
                            }

                            // 3. Try matching by Name if ID/Index fails
                            if (!match) {
                                match = user.birthProfiles.find(bp =>
                                    bp.name.toLowerCase().trim() === profile.name?.toLowerCase().trim()
                                );
                            }

                            if (match) {
                                console.log('[Socket] Enriched shared profile with DB data (by ID/Name)');
                                enrichedProfile = {
                                    ...enrichedProfile,
                                    lat: match.lat || enrichedProfile.lat,
                                    lon: match.lon || enrichedProfile.lon,
                                    hour: match.hour !== undefined ? match.hour : enrichedProfile.hour,
                                    min: match.min !== undefined ? match.min : enrichedProfile.min,
                                    day: match.day || enrichedProfile.day,
                                    month: match.month || enrichedProfile.month,
                                    year: match.year || enrichedProfile.year,
                                    tzone: match.tzone || enrichedProfile.tzone,
                                    _id: match._id,
                                    profileId: match._id?.toString()
                                };
                            } else if (user._id.toString() === targetId?.toString() || user.name?.toLowerCase().trim() === profile.name?.toLowerCase().trim()) {
                                // Match with primary user details
                                console.log('[Socket] Enriched shared profile with PRIMARY user data');
                                enrichedProfile = {
                                    ...enrichedProfile,
                                    lat: user.lat || enrichedProfile.lat,
                                    lon: user.lon || enrichedProfile.lon,
                                    hour: user.hour !== undefined ? user.hour : enrichedProfile.hour,
                                    min: user.min !== undefined ? user.min : enrichedProfile.min,
                                    day: user.day || enrichedProfile.day,
                                    month: user.month || enrichedProfile.month,
                                    year: user.year || enrichedProfile.year,
                                    tzone: user.tzone || enrichedProfile.tzone,
                                    _id: 'primary',
                                    profileId: 'primary'
                                };
                            }
                        }
                    }
                } catch (enrichError) {
                    console.error('[Socket] Share profile enrichment error:', enrichError);
                }

                // Save to DB and broadcast SHARE_PROFILE
                await chatService.shareProfile(sessionId, enrichedProfile);
            } catch (error) {
                console.error('[Socket] Share profile error:', error);
            }
        });

        // Handle SHARE_PROFILE (uppercase alias)
        socket.on('SHARE_PROFILE', async (data: { sessionId: string, profile: any }) => {
            try {
                const { sessionId, profile } = data;
                if (!sessionId || !profile) return;

                // Re-use the same logic by triggering the lowercase event or duplicating
                // Best to duplicate/refactor but for speed let's just make sure it enriches too
                socket.emit('share_profile', data);
            } catch (error) {
                console.error('[Socket] SHARE_PROFILE error:', error);
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

        // Handle cancel chat request (for users)
        socket.on('cancel_chat_request', async (data: { sessionId: string }) => {
            try {
                if (userType !== 'user') {
                    socket.emit('error', { message: 'Only users can cancel chat requests' });
                    return;
                }

                const { sessionId } = data;
                console.log(`[Socket] Cancel chat request from user ${userId} for session ${sessionId}`);

                const result = await chatService.cancelChatRequest(sessionId, userId);

                if (result.cancelled) {
                    socket.emit('CHAT_REQUEST_CANCELLED_SUCCESS', { sessionId });
                } else {
                    socket.emit('error', { message: `Failed to cancel request: ${result.reason}` });
                }

            } catch (error: any) {
                console.error('[Socket] Cancel chat request error:', error);
                socket.emit('error', { message: error.message || 'Failed to cancel chat request' });
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
