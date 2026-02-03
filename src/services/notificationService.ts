import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import User from '../models/User';
import Astrologer from '../models/Astrologer';

/**
 * NotificationService - Firebase Cloud Messaging handler
 * 
 * Handles push notifications for:
 * - Chat message notifications (when recipient is not on chat screen)
 * - High-priority chat request notifications (call-like UI for astrologers)
 * 
 * Uses environment variables for Railway deployment compatibility.
 */
class NotificationService {
    private initialized = false;

    /**
     * Initialize Firebase Admin SDK using environment variables
     * Supports both a single FIREBASE_SERVICE_ACCOUNT JSON string/Base64
     * OR individual vars (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY).
     */
    initialize(): void {
        console.log('[NotificationService] initialize() called');
        if (this.initialized) {
            console.log('[NotificationService] Already initialized');
            return;
        }

        try {
            let serviceAccount: any = null;

            // 0. Priority: Attempt to load from local file (often contains correct local dev credentials)
            try {
                // Check relative to built file (dist/services/notificationService.js -> dist/services -> dist -> root)
                const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
                if (fs.existsSync(serviceAccountPath)) {
                    console.log(`[NotificationService] Found local credential file at: ${serviceAccountPath}`);
                    const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
                    serviceAccount = JSON.parse(fileContent);
                    console.log(`[NotificationService] Loaded credentials from local JSON file. Project: ${serviceAccount.project_id || serviceAccount.projectId}`);
                }
            } catch (fileError) {
                console.warn('[NotificationService] Failed to load local service account file:', fileError);
            }

            // 1. Try single JSON/Base64 service account string
            const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
            console.log(`[NotificationService] FIREBASE_SERVICE_ACCOUNT env key present: ${!!saJson}`);

            if (saJson) {
                try {
                    let decodedSa = saJson.trim();
                    // Handle Base64 if needed
                    if (!decodedSa.startsWith('{')) {
                        console.log('[NotificationService] Attempting to decode Base64 service account');
                        const buffer = Buffer.from(decodedSa, 'base64').toString('utf8');
                        if (buffer.startsWith('{')) decodedSa = buffer;
                    }
                    serviceAccount = JSON.parse(decodedSa);
                    console.log('[NotificationService] Successfully parsed FIREBASE_SERVICE_ACCOUNT JSON');
                } catch (e) {
                    console.warn('[NotificationService] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON');
                }
            }

            // 2. Fallback to individual variables
            if (!serviceAccount) {
                const projectId = process.env.FIREBASE_PROJECT_ID;
                const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
                let privateKey = process.env.FIREBASE_PRIVATE_KEY;

                if (privateKey) {
                    // 1. Strip surrounding quotes (recursive)
                    privateKey = privateKey.trim();
                    while (privateKey.startsWith('"') || privateKey.startsWith("'")) {
                        privateKey = privateKey.substring(1, privateKey.length - 1).trim();
                    }

                    // 2. Aggressive newline handling: 
                    // Matches one or more backslashes followed by 'n' (e.g. \n, \\n, \\\n)
                    // and replaces them with a single real newline character.
                    privateKey = privateKey.replace(/\\+n/g, '\n').replace(/\\r/g, '');

                    // 3. Final safety trim
                    privateKey = privateKey.trim();
                }

                console.log(`[NotificationService] Individual env vars check: 
                    PROJECT_ID: ${!!projectId}, 
                    CLIENT_EMAIL: ${!!clientEmail}, 
                    PRIVATE_KEY: ${privateKey ? 'Present' : 'Missing'}`);

                if (projectId && clientEmail && privateKey) {
                    serviceAccount = { projectId, clientEmail, privateKey };
                    console.log(`[NotificationService] Using individual Firebase credentials from env. Project: ${projectId}`);
                }
            }

            if (!serviceAccount) {
                console.error('[NotificationService] CRITICAL: No Firebase credentials found in environment variables!');
                console.warn('[NotificationService] Expected FIREBASE_SERVICE_ACCOUNT (JSON) OR (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
                return;
            }

            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
            }

            this.initialized = true;
            console.log('[NotificationService] Firebase Admin initialized successfully');
        } catch (error) {
            console.error('[NotificationService] Failed to initialize Firebase Admin:', error);
        }
    }

    /**
     * Check if notification service is ready
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Send notification to a user by userId
     */
    async sendToUser(
        userId: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping notification');
            return false;
        }

        try {
            const user = await User.findById(userId);
            if (!user?.fcmToken) {
                console.log(`[NotificationService] User ${userId} has no FCM token`);
                return false;
            }

            return await this.sendNotification(user.fcmToken, notification, data);
        } catch (error) {
            console.error('[NotificationService] Error sending to user:', error);
            return false;
        }
    }

    /**
     * Send notification to an astrologer by astrologerId
     */
    async sendToAstrologer(
        astrologerId: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping notification');
            return false;
        }

        try {
            const astrologer = await Astrologer.findById(astrologerId);
            if (!astrologer?.fcmToken) {
                console.log(`[NotificationService] Astrologer ${astrologerId} has no FCM token`);
                return false;
            }

            return await this.sendNotification(astrologer.fcmToken, notification, data);
        } catch (error) {
            console.error('[NotificationService] Error sending to astrologer:', error);
            return false;
        }
    }

    /**
     * Send a chat message notification
     * Used when recipient is not actively viewing the chat screen
     */
    async sendChatMessageNotification(
        recipientId: string,
        recipientType: 'user' | 'astrologer',
        senderName: string,
        messageText: string,
        sessionId: string,
        astrologerId?: string,
        astrologerName?: string
    ): Promise<boolean> {
        const notification = {
            title: senderName,
            body: messageText.length > 100 ? messageText.substring(0, 97) + '...' : messageText,
        };

        const data: Record<string, string> = {
            type: 'chat_message',
            sessionId,
            senderName,
            click_action: 'OPEN_CHAT',
        };

        // Add extra data for user app navigation
        if (astrologerId) data.astrologerId = astrologerId;
        if (astrologerName) data.astrologerName = astrologerName;

        if (recipientType === 'user') {
            return await this.sendToUser(recipientId, notification, data);
        } else {
            return await this.sendToAstrologer(recipientId, notification, data);
        }
    }

    /**
     * Send a high-priority chat request notification
     * This creates an "incoming call" style notification for astrologers
     */
    async sendHighPriorityChatRequest(
        astrologerId: string,
        request: {
            sessionId: string;
            userId: string;
            userName: string;
            userMobile?: string;
            ratePerMinute: number;
            intakeDetails?: any;
        }
    ): Promise<boolean> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, skipping high-priority notification');
            return false;
        }

        try {
            const astrologer = await Astrologer.findById(astrologerId);
            if (!astrologer?.fcmToken) {
                console.log(`[NotificationService] Astrologer ${astrologerId} has no FCM token for high-priority request`);
                return false;
            }

            // IMPORTANT: Data-only message (no notification field)
            // This ensures the background handler ALWAYS runs, even when app is killed
            // The notifee library on client will display the full-screen notification
            const message: admin.messaging.Message = {
                token: astrologer.fcmToken,
                // NO notification field - data-only message
                data: {
                    type: 'chat_request',
                    sessionId: request.sessionId,
                    userId: request.userId,
                    userName: request.userName,
                    userMobile: request.userMobile || '',
                    ratePerMinute: String(request.ratePerMinute),
                    intakeDetails: request.intakeDetails ? JSON.stringify(request.intakeDetails) : '',
                },
                android: {
                    priority: 'high',
                    // TTL of 30 seconds (matches incoming call timeout)
                    ttl: 30 * 1000,
                },
            };

            const response = await admin.messaging().send(message);
            console.log(`[NotificationService] High-priority request sent: ${response}`);
            return true;
        } catch (error: any) {
            console.error('[NotificationService] Error sending high-priority request:', error);

            // Handle invalid token
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                await this.clearAstrologerTokenById(astrologerId);
            }

            return false;
        }
    }

    /**
     * Send notification to a specific FCM token
     */
    private async sendNotification(
        token: string,
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<boolean> {
        try {
            const message: admin.messaging.Message = {
                token,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: data || {},
                android: {
                    priority: 'high',
                    notification: {
                        channelId: 'chat_messages',
                        priority: 'high',
                        defaultSound: true,
                    },
                },
            };

            const response = await admin.messaging().send(message);
            console.log(`[NotificationService] Notification sent: ${response}`);
            return true;
        } catch (error: any) {
            console.error('[NotificationService] Send notification error:', error);

            // Handle invalid/expired tokens
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                console.log('[NotificationService] Invalid token, should be cleaned up');
            }

            return false;
        }
    }

    /**
     * Clear invalid FCM token for user
     */
    async clearUserToken(userId: string): Promise<void> {
        try {
            await User.findByIdAndUpdate(userId, {
                $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
            });
            console.log(`[NotificationService] Cleared FCM token for user ${userId}`);
        } catch (error) {
            console.error('[NotificationService] Error clearing user token:', error);
        }
    }

    /**
     * Clear invalid FCM token for astrologer
     */
    async clearAstrologerToken(userId: string): Promise<void> {
        try {
            await Astrologer.findOneAndUpdate({ userId }, {
                $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
            });
            console.log(`[NotificationService] Cleared FCM token for astrologer user ${userId}`);
        } catch (error) {
            console.error('[NotificationService] Error clearing astrologer token:', error);
        }
    }

    /**
     * Clear invalid FCM token for astrologer by Astrologer ID (used by send failures)
     */
    async clearAstrologerTokenById(astrologerId: string): Promise<void> {
        try {
            await Astrologer.findByIdAndUpdate(astrologerId, {
                $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 }
            });
            console.log(`[NotificationService] Cleared FCM token for astrologer ${astrologerId}`);
        } catch (error) {
            console.error('[NotificationService] Error clearing astrologer token by ID:', error);
        }
    }

    /**
     * Register/update FCM token for a user
     */
    async registerUserToken(userId: string, fcmToken: string): Promise<boolean> {
        try {
            await User.findByIdAndUpdate(userId, {
                fcmToken,
                fcmTokenUpdatedAt: new Date(),
            });
            console.log(`[NotificationService] Registered FCM token for user ${userId}`);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error registering user token:', error);
            return false;
        }
    }

    /**
     * Register/update FCM token for an astrologer
     */
    async registerAstrologerToken(userId: string, fcmToken: string): Promise<boolean> {
        try {
            await Astrologer.findOneAndUpdate({ userId }, {
                fcmToken,
                fcmTokenUpdatedAt: new Date(),
            });
            console.log(`[NotificationService] Registered FCM token for astrologer user ${userId}`);
            return true;
        } catch (error) {
            console.error('[NotificationService] Error registering astrologer token:', error);
            return false;
        }
    }

    /**
     * Broadcast a notification to a specific audience
     * Targets users, astrologers, or both based on the audience parameter.
     * Uses batching (500 tokens/request) for production scalability.
     */
    async broadcast(
        audience: 'all' | 'users' | 'astrologers',
        notification: { title: string; body: string },
        data?: Record<string, string>
    ): Promise<{ success: number; failure: number }> {
        if (!this.initialized) {
            console.warn('[NotificationService] Not initialized, cannot broadcast');
            return { success: 0, failure: 0 };
        }

        const tokens: string[] = [];

        try {
            // 1. Collect tokens based on audience
            if (audience === 'users' || audience === 'all') {
                const users = await User.find({
                    fcmToken: { $exists: true, $ne: '' },
                    role: 'user'
                }).select('fcmToken');
                tokens.push(...users.map(u => u.fcmToken!).filter(t => !!t));
            }

            if (audience === 'astrologers' || audience === 'all') {
                const astrologers = await Astrologer.find({
                    fcmToken: { $exists: true, $ne: '' }
                }).select('fcmToken');
                tokens.push(...astrologers.map(a => a.fcmToken!).filter(t => !!t));
            }

            if (tokens.length === 0) {
                console.log(`[NotificationService] No tokens found for audience: ${audience}`);
                return { success: 0, failure: 0 };
            }

            // 2. Clear duplicates
            const uniqueTokens = Array.from(new Set(tokens));
            console.log(`[NotificationService] Broadcasting to ${uniqueTokens.length} unique devices (Audience: ${audience})`);

            // 3. Process in batches of 500 (FCM limit)
            const batchSize = 500;
            let successCount = 0;
            let failureCount = 0;

            for (let i = 0; i < uniqueTokens.length; i += batchSize) {
                const batch = uniqueTokens.slice(i, i + batchSize);
                const message: admin.messaging.MulticastMessage = {
                    tokens: batch,
                    notification: {
                        title: notification.title,
                        body: notification.body,
                    },
                    data: data || { type: 'broadcast' },
                    android: {
                        priority: 'high',
                        notification: {
                            channelId: 'general',
                            priority: 'high',
                            defaultSound: true,
                        },
                    },
                };

                const response = await admin.messaging().sendEachForMulticast(message);
                successCount += response.successCount;
                failureCount += response.failureCount;

                console.log(`[NotificationService] Batch ${Math.floor(i / batchSize) + 1} sent: ${response.successCount} success, ${response.failureCount} failure`);

                // Optional: Handle invalid tokens from results to keep DB clean
                // response.responses.forEach((resp, idx) => {
                //     if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                //         // Could mark token as invalid here
                //     }
                // });
            }

            return { success: successCount, failure: failureCount };
        } catch (error) {
            console.error('[NotificationService] Broadcast error:', error);
            return { success: 0, failure: 0 };
        }
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
