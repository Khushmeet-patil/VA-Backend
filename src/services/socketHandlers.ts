import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import PersonalizedSession from '../models/PersonalizedSession';
import Notification from '../models/Notification';
import chatService from './chatService';
import callService from './callService';
import notificationService from './notificationService';
import heartbeatService from './heartbeatService';

/**
 * Utility to detect phone numbers in chat messages, with support for obfuscation
 * and bypassing valid date/time birth details.
 */
function containsPhoneNumber(text: string): boolean {
    if (!text) return false;

    // Check if it's a structured profile share to avoid false blocking of birth details
    const lowerText = text.toLowerCase();
    if (lowerText.includes('dob:') && lowerText.includes('tob:') && lowerText.includes('pob:')) {
        return false;
    }

    let normalized = lowerText;

    // 1. Map Unicode digits (subscript, superscript, circled, emoji keycaps) to ASCII digits
    const unicodeMap: { [key: string]: string } = {
        '⓪': '0', '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9',
        '⑴': '1', '⑵': '2', '⑶': '3', '⑷': '4', '⑸': '5', '⑹': '6', '⑺': '7', '⑻': '8', '⑼': '9',
        '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
        '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
        '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
        '0️⃣': '0', '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4', '5️⃣': '5', '6️⃣': '6', '7️⃣': '7', '8️⃣': '8', '9️⃣': '9'
    };

    for (const [unicode, ascii] of Object.entries(unicodeMap)) {
        normalized = normalized.split(unicode).join(ascii);
    }

    // 2. Map word numbers to digits
    const wordToDigitMap: { [key: string]: string } = {
        'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
    };

    // Replace written number words with digits where they have word boundaries
    for (const [word, digit] of Object.entries(wordToDigitMap)) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        normalized = normalized.replace(regex, digit);
    }

    // Replace written numbers when adjacent to digits or common separators
    for (const [word, digit] of Object.entries(wordToDigitMap)) {
        const adjacentRegex = new RegExp(`(?<=\\d)${word}|${word}(?=\\d)`, 'g');
        normalized = normalized.replace(adjacentRegex, digit);
    }

    // 3. Exclude common dates & times to prevent false positives on birth details
    // Years (1940-2039)
    normalized = normalized.replace(/\b(?:19|20)\d{2}\b/g, ' ');
    // Dates like DD/MM/YYYY or YYYY-MM-DD
    normalized = normalized.replace(/\b(?:0?[1-9]|[12]\d|3[01])[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:\d{4}|\d{2})\b/g, ' ');
    normalized = normalized.replace(/\b(?:\d{4}|\d{2})[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.](?:0?[1-9]|[12]\d|3[01])\b/g, ' ');
    // Dates with month words: e.g. 25 Dec 1998, Dec 25 1998
    normalized = normalized.replace(/\b(?:0?[1-9]|[12]\d|3[01])\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:\d{4}|\d{2})\b/g, ' ');
    normalized = normalized.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:0?[1-9]|[12]\d|3[01])\s+(?:\d{4}|\d{2})\b/g, ' ');
    // Times like 11:45 PM or 23:45
    normalized = normalized.replace(/\b(?:0?[1-9]|1[0-2])[:\.][0-5]\d\s*(?:am|pm)?\b/g, ' ');
    normalized = normalized.replace(/\b(?:[01]?\d|2[0-3])[:\.][0-5]\d\b/g, ' ');
    normalized = normalized.replace(/\b(?:0?[1-9]|1[0-2])\s*(?:am|pm)\b/g, ' ');

    // 4. Collapse consecutive spaces, separators, hyphens, parentheses into a single space
    normalized = normalized.replace(/[\s\-\.\,\/\_\\:()\[\]{}]+/g, ' ');

    // 5. Find if there is any sequence of digits (length >= 10) with small gaps (<= 4 index difference)
    const digitPositions: number[] = [];
    for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] >= '0' && normalized[i] <= '9') {
            digitPositions.push(i);
        }
    }

    if (digitPositions.length < 10) {
        return false;
    }

    // Check for a connected sequence of >= 10 digits
    let run = 1;
    for (let i = 0; i < digitPositions.length - 1; i++) {
        const gap = digitPositions[i + 1] - digitPositions[i];
        if (gap <= 4) {
            run++;
            if (run >= 10) {
                return true;
            }
        } else {
            run = 1;
        }
    }

    return false;
}

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
    callService.initialize(io);

    // Authentication middleware for Socket.IO
    // Log raw engine.io connection errors (CORS, upgrade, handshake failures)
    io.engine.on('connection_error', (err: any) => {
        console.error('[Socket] ENGINE connection_error:', {
            code: err.code,
            message: err.message,
            context: err.context,
            req_url: err.req?.url,
            req_origin: err.req?.headers?.origin,
        });
    });

    io.use(async (socket: AuthenticatedSocket, next) => {
        const origin = socket.handshake.headers.origin;
        const transport = socket.conn.transport.name;
        try {
            const token = socket.handshake.auth.token || socket.handshake.query.token;

            if (!token) {
                console.warn(`[Socket] AUTH REJECT: no token | origin=${origin} transport=${transport}`);
                return next(new Error('Authentication required'));
            }

            let decoded: { id: string; role?: string };
            try {
                decoded = jwt.verify(
                    token as string,
                    process.env.JWT_SECRET || 'secret'
                ) as { id: string; role?: string };
            } catch (jwtErr: any) {
                console.warn(`[Socket] AUTH REJECT: jwt.verify failed (${jwtErr?.name}: ${jwtErr?.message}) | origin=${origin} transport=${transport}`);
                return next(new Error('Invalid token'));
            }

            // Determine if user or astrologer
            if (decoded.role === 'astrologer') {
                const astrologer = await Astrologer.findById(decoded.id);
                if (!astrologer) {
                    console.warn(`[Socket] AUTH REJECT: astrologer ${decoded.id} not found in DB`);
                    return next(new Error('Astrologer not found'));
                }
                socket.userId = decoded.id;
                socket.userType = 'astrologer';
            } else {
                const user = await User.findById(decoded.id);
                if (!user) {
                    console.warn(`[Socket] AUTH REJECT: user ${decoded.id} not found in DB`);
                    return next(new Error('User not found'));
                }
                socket.userId = decoded.id;
                socket.userType = 'user';
            }

            console.log(`[Socket] AUTH OK: ${socket.userType} ${socket.userId} | transport=${transport} origin=${origin || '(none)'}`);
            next();
        } catch (error: any) {
            console.error('[Socket] AUTH ERROR (unexpected):', error?.message || error);
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', async (socket: AuthenticatedSocket) => {
        const userId = socket.userId!;
        const userType = socket.userType!;

        // Join user-specific room for targeted events
        const roomName = `${userType}:${userId}`;
        socket.join(roomName);

        // Enhanced logging for debugging - roomSize check confirms the join was successful
        const room = io.sockets.adapter.rooms.get(roomName);
        const roomSize = room ? room.size : 0;
        console.log(`[Socket] ${userType} connected & joined room: ID=${userId}, Room=${roomName}, RoomSize=${roomSize}, SocketID=${socket.id}`);

        if (userType === 'astrologer') {
            heartbeatService.restoreOnlineStatus(userId).catch(err => {
                console.error(`[Socket] Error restoring status for astrologer ${userId}:`, err.message);
            });
        }

        // Join session room FIRST, then redeliver missed messages.
        // Both steps must be sequential — messages must not be emitted to a
        // room before the socket has joined it (race condition fix).
        try {
            const activeSession = userType === 'user'
                ? (await chatService.getActiveSessionForUser(userId) || await callService.getActiveCallForUser(userId))
                : (await chatService.getActiveSessionForAstrologer(userId) || await callService.getActiveCallForAstrologer(userId));
            if (activeSession && activeSession.status === 'ACTIVE') {
                const sessionRoom = `session:${activeSession.sessionId}`;
                socket.join(sessionRoom);
                console.log(`[Socket] Auto-joined session room ${sessionRoom} on connect`);
            }
        } catch (e) {
            // Non-critical: handleReconnect will still redeliver
        }

        // NOW handle reconnect — session room is joined, safe to redeliver
        await chatService.handleReconnect(userId, userType === 'astrologer');
        await callService.handleReconnect(userId, userType === 'astrologer');

        // Handle heartbeat presence updates
        socket.on('heartbeat', async () => {
            if (userId && userType === 'astrologer') {
                await heartbeatService.registerHeartbeat(userId);
            }
        });

        // Handle sending messages.
        // Supports an optional ACK callback: socket.emit('send_message', data, (res) => {...})
        // res = { success: true, messageId, timestamp } or { success: false, error }
        socket.on('send_message', async (data: {
            sessionId: string;
            text: string;
            type?: 'text' | 'image' | 'file' | 'profile_data';
            fileData?: { url: string; name?: string; size?: number };
            replyToId?: string;
        }, callback?: (res: { success: boolean; messageId?: string; timestamp?: string; error?: string }) => void) => {
            try {
                const { sessionId, text, type = 'text', fileData, replyToId } = data;

                console.log('[Socket] send_message received:', { sessionId, type, hasFileData: !!fileData, from: userType });

                if ((type === 'text' || type === 'image' || type === 'file') && text && containsPhoneNumber(text)) {
                    console.warn(`[Socket] Message blocked: Phone number sharing is not allowed | from=${userType} userId=${userId}`);
                    if (typeof callback === 'function') {
                        callback({ success: false, error: 'Sharing phone numbers is not allowed.' });
                    } else {
                        socket.emit('error', { message: 'Sharing phone numbers is not allowed.' });
                    }
                    return;
                }

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

                // Save message with a timeout guard. Retries once on DB_TIMEOUT before failing.
                let savedMsg: any;
                try {
                    savedMsg = await Promise.race([
                        chatService.saveMessage(sessionId, userId, userType, text, type, fileData, replyToId),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('DB_TIMEOUT')), 8000)
                        )
                    ]);
                } catch (firstErr: any) {
                    if (firstErr?.message === 'DB_TIMEOUT') {
                        console.warn('[Socket] DB_TIMEOUT on first attempt — retrying in 500ms...');
                        await new Promise(r => setTimeout(r, 500));
                        savedMsg = await Promise.race([
                            chatService.saveMessage(sessionId, userId, userType, text, type, fileData, replyToId),
                            new Promise<never>((_, reject) =>
                                setTimeout(() => reject(new Error('DB_TIMEOUT')), 10000)
                            )
                        ]);
                    } else {
                        throw firstErr;
                    }
                }

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

                // Determine rooms
                const sessionRoom = `session:${sessionId}`;
                const userRoom = `user:${session.userId}`;
                const astrologerRoom = `astrologer:${session.astrologerId}`;

                const messagePayload = { sessionId, ...message };

                // Belt-and-suspenders delivery: ALWAYS emit to individual rooms.
                // Individual rooms are joined immediately on socket connect (no timing gap),
                // so this is guaranteed to reach any currently connected socket.
                // Session room is emitted to as well when populated — covers sockets
                // that reconnected via connectionStateRecovery and re-joined the session room.
                // Frontend dedup (receivedMessageIds set) silently drops the duplicate.
                io.to(userRoom).emit('RECEIVE_MESSAGE', messagePayload);
                io.to(astrologerRoom).emit('RECEIVE_MESSAGE', messagePayload);

                const sessionRoomSockets = io.sockets.adapter.rooms.get(sessionRoom);
                const sessionRoomSize = sessionRoomSockets ? sessionRoomSockets.size : 0;
                if (sessionRoomSize > 0) {
                    io.to(sessionRoom).emit('RECEIVE_MESSAGE', messagePayload);
                    console.log(`[Socket] RECEIVE_MESSAGE → individual rooms + session:${sessionId} (${sessionRoomSize} sockets)`);
                } else {
                    console.log(`[Socket] RECEIVE_MESSAGE → individual rooms only (${userRoom}, ${astrologerRoom})`);
                }

                // ACK sender immediately after save+broadcast — before FCM/profile detection
                // (FCM is best-effort and must not delay or block the ACK)
                if (typeof callback === 'function') {
                    callback({ success: true, messageId: savedMsg._id.toString(), timestamp: savedMsg.timestamp.toISOString() });
                }

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
                        let senderName = 'User';
                        if (userType === 'user') {
                            const u = await User.findById(userId);
                            const rawName = u?.name || 'User';
                            const isNamePhone = /^[0-9+ ]{10,15}$/.test(rawName.trim());
                            senderName = isNamePhone ? 'User' : rawName;
                        } else {
                            const a = await Astrologer.findById(userId);
                            senderName = a ? `${a.firstName} ${a.lastName || ''}`.trim() : 'Astrologer';
                        }

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

            } catch (error: any) {
                console.error('[Socket] Send message error:', error);
                const errMsg = error?.message === 'DB_TIMEOUT'
                    ? 'Message save timed out, please retry'
                    : 'Failed to send message';
                if (typeof callback === 'function') {
                    callback({ success: false, error: errMsg });
                } else {
                    socket.emit('error', { message: errMsg });
                }
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

        // Handle share profile logic (unified for both lowercase and uppercase events)
        const handleShareProfileEvent = async (data: { sessionId: string, profile: any, text?: string }) => {
            console.log('[Socket] share_profile/SHARE_PROFILE event received:', data);
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
                await chatService.shareProfile(sessionId, enrichedProfile, data.text);
            } catch (error) {
                console.error('[Socket] Share profile error:', error);
            }
        };

        socket.on('share_profile', handleShareProfileEvent);
        socket.on('SHARE_PROFILE', handleShareProfileEvent);

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
        socket.on('end_chat', async (data: { sessionId: string }, callback?: (res: any) => void) => {
            try {
                const { sessionId } = data;

                // Check PersonalizedSession first
                const persSession = await PersonalizedSession.findOne({ sessionId });
                if (persSession) {
                    const now = new Date();
                    let sessionElapsedSec = 0;
                    if (persSession.startTime) {
                        sessionElapsedSec = Math.max(0, Math.round((now.getTime() - new Date(persSession.startTime).getTime()) / 1000));
                    }

                    const totalAllocatedSec = persSession.durationMinutes * 60;
                    const previousUsedSec = persSession.usedDurationSeconds || 0;
                    const totalUsedSec = previousUsedSec + sessionElapsedSec;
                    const remainingSec = Math.max(0, totalAllocatedSec - totalUsedSec);

                    persSession.usedDurationSeconds = totalUsedSec;
                    persSession.remainingDurationSeconds = remainingSec;
                    persSession.endTime = now;

                    const commPercentage = persSession.commissionPercentage || 80;
                    const earnedRatio = totalAllocatedSec > 0 ? Math.min(1, totalUsedSec / totalAllocatedSec) : 1;
                    const proRatedBasePrice = Math.round((persSession.basePrice || 0) * earnedRatio * 100) / 100;
                    const netEarningToCredit = Math.round(((proRatedBasePrice * commPercentage) / 100) * 100) / 100;
                    const platformCommission = Math.max(0, Math.round((proRatedBasePrice - netEarningToCredit) * 100) / 100);

                    persSession.astrologerEarning = netEarningToCredit;
                    persSession.platformCommission = platformCommission;

                    const wasCompleted = persSession.status === 'COMPLETED';

                    // Threshold Rule: If remaining time is less than 60 seconds (1 minute), mark COMPLETED
                    if (remainingSec < 60) {
                        persSession.status = 'COMPLETED';
                        if (netEarningToCredit > 0 && !wasCompleted) {
                            await Astrologer.findByIdAndUpdate(persSession.astrologerId, {
                                $inc: { 
                                    personalizedEarnings: netEarningToCredit, 
                                    earnings: netEarningToCredit,
                                    yearlyGrossEarnings: netEarningToCredit
                                }
                            });
                        }
                    } else {
                        // User still has remaining duration (e.g. 5 mins) left for personalized service
                        persSession.status = 'PAID_PENDING_ACCEPT';
                    }
                    await persSession.save();

                    const endReason = userType === 'user' ? 'USER_END' : 'ASTROLOGER_END';
                    const endPayload = {
                        sessionId,
                        endReason,
                        status: persSession.status,
                        totalMinutes: Math.ceil(totalUsedSec / 60),
                        totalAmount: persSession.totalAmountPaid || persSession.basePrice || 0,
                        remainingDurationSeconds: persSession.remainingDurationSeconds,
                        isPersonalized: true
                    };

                    // Broadcast CHAT_ENDED to session room and both user & astrologer rooms
                    io.to(`session:${sessionId}`).emit('CHAT_ENDED', endPayload);
                    io.to(`user:${persSession.userId}`).emit('CHAT_ENDED', endPayload);
                    io.to(`astrologer:${persSession.astrologerId}`).emit('CHAT_ENDED', endPayload);

                    console.log(`[Socket] Personalized session ended/saved: ${sessionId}, remaining: ${remainingSec}s, status: ${persSession.status}`);
                    if (callback) callback({ success: true, ...endPayload });
                    return;
                }

                // Check CallSession first, then ChatSession
                const callSession = await callService.getSession(sessionId);
                if (callSession) {
                    if (callSession.status !== 'ACTIVE') {
                        const err = { success: false, message: 'Invalid or inactive call session' };
                        if (callback) callback(err);
                        else socket.emit('error', err);
                        return;
                    }
                    const isUser = userType === 'user' && callSession.userId.toString() === userId;
                    const isAstrologer = userType === 'astrologer' && callSession.astrologerId.toString() === userId;
                    if (!isUser && !isAstrologer) {
                        const err = { success: false, message: 'Not a participant in this call session' };
                        if (callback) callback(err);
                        else socket.emit('error', err);
                        return;
                    }
                    const endReason = isUser ? 'USER_END' : 'ASTROLOGER_END';
                    await callService.endCall(sessionId, endReason);
                    if (callback) callback({ success: true });
                    return;
                }

                const session = await chatService.getSession(sessionId);
                if (!session || session.status !== 'ACTIVE') {
                    const err = { success: false, message: 'Invalid or inactive session' };
                    if (callback) callback(err);
                    else socket.emit('error', err);
                    return;
                }

                // Verify sender is part of session
                const isUser = userType === 'user' && session.userId.toString() === userId;
                const isAstrologer = userType === 'astrologer' && session.astrologerId.toString() === userId;

                if (!isUser && !isAstrologer) {
                    const err = { success: false, message: 'Not a participant in this session' };
                    if (callback) callback(err);
                    else socket.emit('error', err);
                    return;
                }

                const endReason = isUser ? 'USER_END' : 'ASTROLOGER_END';
                await chatService.endChat(sessionId, endReason);
                
                if (callback) callback({ success: true });

            } catch (error: any) {
                console.error('[Socket] End chat error:', error);
                const err = { success: false, message: error.message || 'Failed to end chat' };
                if (callback) callback(err);
                else socket.emit('error', err);
            }
        });

        // Per-socket in-flight guard: prevents duplicate accept_chat calls from the same socket
        // before the first one completes (e.g. double-tap on Accept button).
        const inFlightAccepts = new Set<string>();

        // Handle accept chat (for astrologers)
        socket.on('accept_chat', async (data: { sessionId: string }, callback?: (res: any) => void) => {
            try {
                if (userType !== 'astrologer') {
                    const err = { success: false, message: 'Only astrologers can accept chats/calls' };
                    if (callback) callback(err);
                    else socket.emit('error', err);
                    return;
                }

                // Deduplicate concurrent accepts for the same session from this socket
                if (inFlightAccepts.has(data.sessionId)) {
                    console.warn(`[Socket] Duplicate accept_chat ignored for session: ${data.sessionId}`);
                    if (callback) callback({ success: false, message: 'Accept already in progress' });
                    return;
                }
                inFlightAccepts.add(data.sessionId);

                let session: any;
                try {
                    const persSession = await PersonalizedSession.findOne({ sessionId: data.sessionId });
                    if (persSession) {
                        // FIX: Use remainingDurationSeconds (not just durationMinutes*60) so
                        // the endTime reflects partial remaining time for re-sessions.
                        const remainingSec = (persSession.remainingDurationSeconds !== undefined && persSession.remainingDurationSeconds !== null)
                            ? persSession.remainingDurationSeconds
                            : (persSession.durationMinutes * 60);

                        persSession.status = 'ACTIVE';
                        persSession.startTime = new Date();
                        persSession.endTime = new Date(Date.now() + remainingSec * 1000);
                        await persSession.save();
                        session = persSession;

                        const astro = await Astrologer.findById(persSession.astrologerId);
                        const astroName = astro ? `${astro.firstName || ''} ${astro.lastName || ''}`.trim() : 'Astrologer';

                        const startPayload = {
                            sessionId: persSession.sessionId,
                            astrologerId: persSession.astrologerId.toString(),
                            userId: persSession.userId.toString(),
                            astrologerName: astroName,
                            serviceType: persSession.serviceType,
                            // FIX: Map serviceType to the session type the frontend screens expect
                            sessionType: persSession.serviceType === 'call' ? 'personalized_call'
                                : persSession.serviceType === 'video' ? 'personalized_video'
                                : 'personalized_chat',
                            durationMinutes: persSession.durationMinutes,
                            // FIX: Include remainingDurationSeconds so timer starts from the
                            // correct remaining time (not the full original duration).
                            remainingDurationSeconds: remainingSec,
                            startTime: persSession.startTime!.toISOString(),
                            profileData: persSession.profileData,
                            isPersonalized: true
                        };

                        // Broadcast CHAT_STARTED over socket to session room and user room so user navigates immediately
                        io.to(`session:${persSession.sessionId}`).emit('CHAT_STARTED', startPayload);
                        io.to(`user:${persSession.userId}`).emit('CHAT_STARTED', startPayload);
                        io.to(`astrologer:${persSession.astrologerId}`).emit('CHAT_STARTED', startPayload);

                        // Send FCM push to user as backup
                        notificationService.sendChatStartedNotification(persSession.userId.toString(), {
                            sessionId: persSession.sessionId,
                            astrologerId: persSession.astrologerId.toString(),
                            astrologerName: astroName,
                            ratePerMinute: persSession.basePrice,
                            startTime: persSession.startTime.toISOString()
                        }).catch(err => console.error('[Socket] FCM chat_started push failed:', err));

                        console.log(`[Socket] Personalized session accepted & CHAT_STARTED emitted: ${data.sessionId}`);
                    } else {
                        const callSession = await callService.getSession(data.sessionId);
                        if (callSession) {
                            session = await callService.acceptCallRequest(data.sessionId);
                        } else {
                            session = await chatService.acceptChatRequest(data.sessionId);
                        }
                    }
                } finally {
                    inFlightAccepts.delete(data.sessionId);
                }

                if (callback) callback({ success: true, session });

            } catch (error: any) {
                console.error('[Socket] Accept chat/call error:', error);

                // Check if this is a "cancelled or expired" error - handle gracefully
                if (error.message && error.message.includes('cancelled or expired')) {
                    const res = {
                        success: false,
                        code: 'CANCELLED',
                        message: 'User cancelled the request before you could accept'
                    };
                    if (callback) callback(res);

                    socket.emit('CHAT_ACCEPT_FAILED', {
                        sessionId: data.sessionId,
                        reason: res.message
                    });
                } else if (
                    (error.message && error.message.includes('Cannot accept session with status: ENDED')) ||
                    (error.message && error.message.includes('expired'))
                ) {
                    const res = {
                        success: false,
                        code: 'EXPIRED',
                        message: 'This request has already expired. The user will need to send a new request.'
                    };
                    if (callback) callback(res);
                    socket.emit('CHAT_ACCEPT_FAILED', {
                        sessionId: data.sessionId,
                        reason: res.message
                    });
                } else {
                    const err = { success: false, message: error.message || 'Failed to accept chat/call' };
                    if (callback) callback(err);
                    else socket.emit('error', err);
                }
            }
        });

        // Handle reject chat (for astrologers)
        socket.on('reject_chat', async (data: { sessionId: string }, callback?: (res: any) => void) => {
            try {
                if (userType !== 'astrologer') {
                    const err = { success: false, message: 'Only astrologers can reject chats/calls' };
                    if (callback) callback(err);
                    else socket.emit('error', err);
                    return;
                }

                const persSession = await PersonalizedSession.findOne({ sessionId: data.sessionId });
                if (persSession) {
                    persSession.status = 'MISSED';
                    persSession.missedAt = new Date();
                    await persSession.save();

                    const astro = await Astrologer.findById(persSession.astrologerId);
                    const astroUserId = astro?.userId || (persSession.astrologerId as any)?.userId;
                    const astroName = astro ? `${astro.firstName || ''} ${astro.lastName || ''}`.trim() : 'Astrologer';

                    if (astroUserId) {
                        await Notification.create({
                            recipient: astroUserId,
                            recipientType: 'astrologer',
                            userId: astroUserId,
                            audience: 'user',
                            title: 'Missed Personalized Request',
                            message: `You missed a personalized ${persSession.serviceType} request (${persSession.durationMinutes} mins).`,
                            type: 'MISSED_PERSONALIZED_REQUEST',
                            metadata: { sessionId: persSession.sessionId, astrologerId: persSession.astrologerId }
                        });
                    }

                    // Emit CHAT_REJECTED to user socket room
                    io.to(`user:${persSession.userId}`).emit('CHAT_REJECTED', {
                        sessionId: persSession.sessionId,
                        reason: `${astroName} declined your request. Your paid token is saved!`,
                        astrologerName: astroName,
                        isPersonalized: true
                    });

                    // Send FCM push notification to user
                    notificationService.sendChatRejectedNotification(
                        persSession.userId.toString(),
                        astroName,
                        'ASTROLOGER_REJECTED'
                    ).catch(err => console.error('[Socket] FCM chat_rejected push failed:', err));

                    console.log(`[Socket] Personalized session rejected: ${data.sessionId}`);
                } else {
                    const callSession = await callService.getSession(data.sessionId);
                    if (callSession) {
                        await callService.rejectCallRequest(data.sessionId);
                    } else {
                        await chatService.rejectChatRequest(data.sessionId);
                    }
                }
                if (callback) callback({ success: true });

            } catch (error: any) {
                console.error('[Socket] Reject chat/call error:', error);
                const err = { success: false, message: error.message || 'Failed to reject chat/call' };
                if (callback) callback(err);
                else socket.emit('error', err);
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
                    socket.emit('error', { message: 'Only users can cancel requests' });
                    return;
                }

                const { sessionId } = data;
                console.log(`[Socket] Cancel request from user ${userId} for session ${sessionId}`);

                const callSession = await callService.getSession(sessionId);
                let result;
                if (callSession) {
                    result = await callService.cancelCallRequest(sessionId, userId);
                } else {
                    result = await chatService.cancelChatRequest(sessionId, userId);
                }

                if (result.cancelled) {
                    socket.emit('CHAT_REQUEST_CANCELLED_SUCCESS', { sessionId });
                } else {
                    socket.emit('error', { message: `Failed to cancel request: ${result.reason}` });
                }

            } catch (error: any) {
                console.error('[Socket] Cancel request error:', error);
                socket.emit('error', { message: error.message || 'Failed to cancel request' });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket] ${userType} disconnected: ${userId}`);

            // NOTE: The 60-second offline grace timer lives entirely on the client (SocketContext.tsx).
            // It is driven by @react-native-community/netinfo and calls the REST API when internet
            // restores after >60s. We do NOT start an offline timer here because socket disconnect
            // fires for many reasons (app kill, crash, logout) — not just network loss.
            if (userType === 'astrologer') {
                chatService.handleDisconnect(userId, true).catch(err => {
                    console.error('[Socket] chatService.handleDisconnect error:', err);
                });
            }

            // Check active call first, then active chat
            callService.getActiveCallForUser(userId).then(activeCallUser => {
                if (activeCallUser) {
                    callService.handleDisconnect(userId, false);
                } else {
                    callService.getActiveCallForAstrologer(userId).then(activeCallAstro => {
                        if (activeCallAstro) {
                            callService.handleDisconnect(userId, true);
                        } else if (userType !== 'astrologer') {
                            chatService.handleDisconnect(userId, false);
                        }
                    });
                }
            }).catch(err => {
                console.error('[Socket] Disconnect check error:', err);
                if (userType !== 'astrologer') {
                    chatService.handleDisconnect(userId, false);
                }
            });
        });
    });

    console.log('[Socket] Handlers initialized');
}

export default initializeSocketHandlers;
