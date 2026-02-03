"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = exports.sendChatRejectedNotification = exports.sendChatAcceptedNotification = exports.sendMessageNotification = exports.sendChatRequestNotification = exports.isFCMAvailable = exports.initializeFCM = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * FCM Notification Service
 *
 * Handles Firebase Cloud Messaging for push notifications.
 * - High-priority "call" notifications for chat requests
 * - Regular notifications for chat messages
 */
let isInitialized = false;
/**
 * Initialize Firebase Admin SDK
 */
const initializeFCM = () => {
    if (isInitialized) {
        return true;
    }
    try {
        let serviceAccount;
        // 1. Try to load from environment variable (useful for Railway)
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                let jsonStr = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
                // Remove surrounding quotes if any (common when copy-pasting from .env files)
                if ((jsonStr.startsWith('"') && jsonStr.endsWith('"')) ||
                    (jsonStr.startsWith("'") && jsonStr.endsWith("'"))) {
                    jsonStr = jsonStr.substring(1, jsonStr.length - 1).trim();
                }
                // If it looks like base64 (doesn't start with {), try decoding it
                if (!jsonStr.startsWith('{')) {
                    try {
                        const decoded = Buffer.from(jsonStr, 'base64').toString('utf8');
                        if (decoded.trim().startsWith('{')) {
                            jsonStr = decoded.trim();
                            console.log('[FCM] Decoding service account from Base64');
                        }
                    }
                    catch (e) {
                        // Not valid base64 or failed to decode, continue with raw string
                    }
                }
                // Attempt to parse the JSON
                try {
                    serviceAccount = JSON.parse(jsonStr);
                    console.log('[FCM] Using service account from environment variable');
                }
                catch (parseError) {
                    console.warn('[FCM] Initial JSON parse failed, attempting sanitization...');
                    // Try replacing literal newlines with \n
                    const sanitized = jsonStr.replace(/\n/g, '\\n');
                    try {
                        serviceAccount = JSON.parse(sanitized);
                        console.log('[FCM] Parsed service account after newline sanitization');
                    }
                    catch (secondError) {
                        // One last try: if it has escaped backslashes, fix them
                        const fixedEscapes = jsonStr.replace(/\\\\n/g, '\\n');
                        serviceAccount = JSON.parse(fixedEscapes);
                        console.log('[FCM] Parsed service account after escape fix');
                    }
                }
            }
            catch (e) {
                console.error('[FCM] Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e.message);
                if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                    console.log('[FCM] Env var starts with:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 50));
                }
            }
        }
        // 2. Fallback to local file
        if (!serviceAccount) {
            const serviceAccountPath = path_1.default.join(__dirname, '../../firebase-service-account.json');
            if (fs_1.default.existsSync(serviceAccountPath)) {
                serviceAccount = JSON.parse(fs_1.default.readFileSync(serviceAccountPath, 'utf8'));
                console.log('[FCM] Using service account from local file');
            }
        }
        if (!serviceAccount) {
            console.warn('[FCM] Firebase service account not found (env or file). Push notifications disabled.');
            return false;
        }
        firebase_admin_1.default.initializeApp({
            credential: firebase_admin_1.default.credential.cert(serviceAccount),
        });
        isInitialized = true;
        console.log('[FCM] Firebase Admin SDK initialized successfully');
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to initialize Firebase Admin SDK:', error);
        return false;
    }
};
exports.initializeFCM = initializeFCM;
/**
 * Check if FCM is available
 */
const isFCMAvailable = () => {
    return isInitialized;
};
exports.isFCMAvailable = isFCMAvailable;
/**
 * Send a high-priority chat request notification (call-like)
 * This triggers a full-screen incoming call UI on the astrologer's device
 */
const sendChatRequestNotification = (fcmToken, userName, sessionId, astrologerId, userId, userPhoto) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isInitialized || !fcmToken) {
        console.log('[FCM] Cannot send chat request notification - not initialized or no token');
        return false;
    }
    try {
        const message = {
            token: fcmToken,
            data: {
                type: 'CHAT_REQUEST',
                sessionId,
                astrologerId,
                userId,
                userName,
                userPhoto: userPhoto || '',
                timestamp: Date.now().toString(),
            },
            android: {
                priority: 'high',
                ttl: 30000, // 30 seconds - matches request timeout
                notification: {
                    title: 'Incoming Chat Request',
                    body: `${userName} wants to chat with you`,
                    icon: 'ic_notification',
                    color: '#FF6B35',
                    sound: 'chat_request_ringtone',
                    channelId: 'chat_requests',
                    priority: 'max',
                    visibility: 'public',
                    // Full-screen intent for call-like experience
                    defaultVibrateTimings: false,
                    vibrateTimingsMillis: [0, 500, 200, 500, 200, 500],
                },
            },
            // For app in foreground - handled by client
            notification: {
                title: 'Incoming Chat Request',
                body: `${userName} wants to chat with you`,
            },
        };
        const response = yield firebase_admin_1.default.messaging().send(message);
        console.log(`[FCM] Chat request notification sent: ${response}`);
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to send chat request notification:', error.message);
        // Handle token expiration
        if (error.code === 'messaging/registration-token-not-registered') {
            console.log('[FCM] Token expired or invalid, should be removed');
        }
        return false;
    }
});
exports.sendChatRequestNotification = sendChatRequestNotification;
/**
 * Send a regular chat message notification
 * Uses default system notification sound
 */
const sendMessageNotification = (fcmToken, senderName, messageText, sessionId, senderId, senderType, senderPhoto) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isInitialized || !fcmToken) {
        console.log('[FCM] Cannot send message notification - not initialized or no token');
        return false;
    }
    try {
        // Truncate message for notification
        const truncatedMessage = messageText.length > 100
            ? messageText.substring(0, 100) + '...'
            : messageText;
        const message = {
            token: fcmToken,
            data: {
                type: 'CHAT_MESSAGE',
                sessionId,
                senderId,
                senderType,
                senderName,
                senderPhoto: senderPhoto || '',
                messagePreview: truncatedMessage,
                timestamp: Date.now().toString(),
            },
            android: {
                priority: 'high',
                notification: {
                    title: senderName,
                    body: truncatedMessage,
                    icon: 'ic_notification',
                    color: '#FF6B35',
                    // Use default sound
                    defaultSound: true,
                    channelId: 'chat_messages',
                    tag: `chat_${sessionId}`, // Group messages from same chat
                },
            },
            notification: {
                title: senderName,
                body: truncatedMessage,
            },
        };
        const response = yield firebase_admin_1.default.messaging().send(message);
        console.log(`[FCM] Message notification sent: ${response}`);
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to send message notification:', error.message);
        return false;
    }
});
exports.sendMessageNotification = sendMessageNotification;
/**
 * Send a chat accepted notification to user
 */
const sendChatAcceptedNotification = (fcmToken, astrologerName, sessionId, astrologerId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isInitialized || !fcmToken) {
        return false;
    }
    try {
        const message = {
            token: fcmToken,
            data: {
                type: 'CHAT_ACCEPTED',
                sessionId,
                astrologerId,
                astrologerName,
                timestamp: Date.now().toString(),
            },
            android: {
                priority: 'high',
                notification: {
                    title: 'Chat Request Accepted',
                    body: `${astrologerName} has accepted your chat request`,
                    icon: 'ic_notification',
                    color: '#4CAF50',
                    defaultSound: true,
                    channelId: 'chat_updates',
                },
            },
            notification: {
                title: 'Chat Request Accepted',
                body: `${astrologerName} has accepted your chat request`,
            },
        };
        yield firebase_admin_1.default.messaging().send(message);
        console.log(`[FCM] Chat accepted notification sent`);
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to send chat accepted notification:', error.message);
        return false;
    }
});
exports.sendChatAcceptedNotification = sendChatAcceptedNotification;
/**
 * Send a chat rejected/timeout notification to user
 */
const sendChatRejectedNotification = (fcmToken, astrologerName, reason) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isInitialized || !fcmToken) {
        return false;
    }
    try {
        const message = {
            token: fcmToken,
            data: {
                type: 'CHAT_REJECTED',
                reason,
                timestamp: Date.now().toString(),
            },
            android: {
                priority: 'high',
                notification: {
                    title: 'Chat Request Declined',
                    body: reason,
                    icon: 'ic_notification',
                    color: '#F44336',
                    defaultSound: true,
                    channelId: 'chat_updates',
                },
            },
            notification: {
                title: 'Chat Request Declined',
                body: reason,
            },
        };
        yield firebase_admin_1.default.messaging().send(message);
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to send chat rejected notification:', error.message);
        return false;
    }
});
exports.sendChatRejectedNotification = sendChatRejectedNotification;
/**
 * Send a generic notification
 */
const sendNotification = (fcmToken, title, body, data) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isInitialized || !fcmToken) {
        return false;
    }
    try {
        const message = {
            token: fcmToken,
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    title,
                    body,
                    icon: 'ic_notification',
                    color: '#FF6B35',
                    defaultSound: true,
                    channelId: 'general',
                },
            },
            notification: {
                title,
                body,
            },
        };
        yield firebase_admin_1.default.messaging().send(message);
        return true;
    }
    catch (error) {
        console.error('[FCM] Failed to send notification:', error.message);
        return false;
    }
});
exports.sendNotification = sendNotification;
exports.default = {
    initializeFCM: exports.initializeFCM,
    isFCMAvailable: exports.isFCMAvailable,
    sendChatRequestNotification: exports.sendChatRequestNotification,
    sendMessageNotification: exports.sendMessageNotification,
    sendChatAcceptedNotification: exports.sendChatAcceptedNotification,
    sendChatRejectedNotification: exports.sendChatRejectedNotification,
    sendNotification: exports.sendNotification,
};
